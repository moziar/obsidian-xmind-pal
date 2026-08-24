import { MarkdownRenderChild } from 'obsidian';
import XMindViewerPlugin from './main';
import { processXMindBlock, showError } from './xmind-codeblock';
import { t } from './i18n';

const COMMENT_PREFIX = 'xmind-pal';

/**
 * Register a markdown post-processor that turns `%%xmind-pal%%` comment
 * directives into live mind-map previews in Reading Mode.
 *
 * In Reading Mode, Obsidian strips `%%comment%%` from the rendered DOM,
 * leaving behind empty `<p>` elements. This processor reads the raw markdown
 * for the *current section* via `ctx.getSectionInfo()` to find directives,
 * then replaces the corresponding empty paragraphs with viewer containers.
 *
 * In Live Preview the comment stays hidden (Obsidian's native behavior),
 * which is the desired effect — it keeps long-form writing uncluttered.
 *
 * Rendering is performed inside `MarkdownRenderChild.onload()`. Obsidian's
 * Reading Mode virtual scroller unloads off-screen sections (calling
 * `onunload()`) and reloads them when scrolled back into view (calling
 * `onload()` again). By tying rendering to the component lifecycle, we
 * automatically re-render when sections are re-attached, without polling.
 *
 * Supported syntaxes inside the comment:
 *   %%xmind-pal%%                        → default property
 *   %%xmind-pal property: name%%         → custom property
 *   %%xmind-pal ![[file.xmind]]%%        → embed link
 *   %%xmind-pal [[file.xmind]]%%         → wikilink
 *   %%xmind-pal file: path.xmind%%       → direct file path
 */
export function registerXMindComment(plugin: XMindViewerPlugin): void {
	plugin.registerMarkdownPostProcessor((el, ctx) => {
		const sectionInfo = ctx.getSectionInfo(el);
		if (!sectionInfo) return;

		// Extract only the current section's text. `sectionInfo.text` is the
		// entire document; `lineStart`/`lineEnd` are inclusive 0-indexed line
		// numbers that bound the section being rendered. Searching only the
		// section text ensures each section processes its own directives
		// rather than re-processing every directive in the document.
		const lines = sectionInfo.text.split('\n');
		const sectionText = lines
			.slice(sectionInfo.lineStart, sectionInfo.lineEnd + 1)
			.join('\n');

		// Quick filter: skip sections that don't contain the directive at all
		if (!sectionText.includes(`%%${COMMENT_PREFIX}`)) return;

		const directives = findDirectives(sectionText);
		if (directives.length === 0) return;

		// Find empty paragraphs that correspond to stripped comments.
		// Obsidian removes `%%...%%` from the DOM but leaves an empty `<p>`.
		const paragraphs = el.tagName === 'P'
			? [el]
			: Array.from(el.querySelectorAll('p'));
		const emptyParagraphs = paragraphs.filter(p => !p.textContent?.trim());

		// Replace empty paragraphs with viewers, in order of appearance.
		// Rendering is deferred to `MarkdownRenderChild.onload()` so that
		// Obsidian's lifecycle manages re-rendering when the section is
		// detached and re-attached by the virtual scroller.
		const count = Math.min(directives.length, emptyParagraphs.length);
		for (let i = 0; i < count; i++) {
			const p = emptyParagraphs[i];
			const content = directives[i];

			const container = createDiv();
			container.className = 'xmind-viewer-container';
			p.replaceWith(container);

			const child = new MarkdownRenderChild(container);
			let cleanup: (() => void) | undefined;
			let cancelled = false;

			child.onload = () => {
				cancelled = false;
				processXMindBlock(plugin, content, container, ctx, (makeCleanup) => {
					cleanup?.();
					cleanup = makeCleanup();
				}).then(() => {
					// If unloaded while processing, immediately clean up
					// to avoid leaking resources in a detached container.
					if (cancelled) {
						cleanup?.();
						cleanup = undefined;
					}
				}).catch((e) => {
					if (cancelled) return;
					showError(container, t('error.renderFailed', { message: e instanceof Error ? e.message : String(e) }));
				});
			};

			child.onunload = () => {
				cancelled = true;
				cleanup?.();
				cleanup = undefined;
			};

			ctx.addChild(child);
		}
	});
}

/**
 * Find all `%%xmind-pal...%%` directives in the raw markdown text.
 * Strips blockquote prefixes (>) from lines inside callouts.
 * Returns the content between `%%xmind-pal` and `%%` for each directive.
 */
function findDirectives(text: string): string[] {
	const directives: string[] = [];
	const regex = new RegExp(`%%${COMMENT_PREFIX}([\\s\\S]*?)%%`, 'g');
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		// Strip blockquote prefix from each line (for comments inside callouts)
		const content = match[1]
			.split('\n')
			.map(line => line.replace(/^>\s?/, ''))
			.join('\n')
			.trim();
		directives.push(content);
	}
	return directives;
}
