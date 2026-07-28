import { TFile } from 'obsidian';
import { unzip, Unzipped } from 'fflate';
import XMindViewerPlugin from './main';
import { t } from './i18n';

const THUMBNAIL_PATHS = [
	'Thumbnails/thumbnail.png',
	'Thumbnails/thumbnail.jpg',
	'thumbnails/thumbnail.png',
	'thumbnails/thumbnail.jpg',
];
const THUMBNAIL_PATH_SET = new Set(THUMBNAIL_PATHS);

/**
 * Extract the thumbnail image from an .xmind (ZIP) archive.
 *
 * Uses fflate's `filter` option so only the thumbnail entry is decompressed;
 * other entries (content.json, attachments/, etc.) are skipped at the
 * local-file-header stage without spending CPU on inflate. This keeps both
 * memory peak and CPU time low even for .xmind files that embed large
 * attachments.
 *
 * The async `unzip` variant is used (not `unzipSync`) so decompression runs
 * in a Web Worker and never blocks the main thread.
 */
function extractThumbnail(fileData: ArrayBuffer): Promise<Uint8Array> {
	const compressed = new Uint8Array(fileData);
	return new Promise<Unzipped>((resolve, reject) => {
		unzip(compressed, { filter: (file) => THUMBNAIL_PATH_SET.has(file.name) }, (err, files) => {
			if (err || !files) {
				reject(err ?? new Error('unzip failed'));
				return;
			}
			resolve(files);
		});
	}).then(files => {
		for (const p of THUMBNAIL_PATHS) {
			const bytes = files[p];
			if (bytes) return bytes;
		}
		throw new Error('thumbnail not found in xmind file');
	});
}

export interface ThumbnailRenderOptions {
	viewerHeight: string;
	/**
	 * File name to display in Obsidian's image Lightbox (v1.13.4+).
	 * The `.xmind` extension is stripped automatically.
	 */
	fileName: string;
}

/**
 * Draw the source image onto a canvas inside `container`.
 * Called once the container is connected and has non-zero dimensions.
 *
 * The canvas is encoded as a **data URI** (base64) rather than a blob URL.
 * This is critical for Obsidian's image Lightbox: when the user clicks the
 * thumbnail, the Lightbox creates a new <img> and loads the same src. Blob
 * URLs can be revoked by cache eviction or re-rendering before the Lightbox
 * opens, causing ERR_FILE_NOT_FOUND. Data URIs are self-contained and never
 * expire, so the Lightbox can always load them.
 */
function drawToCanvas(
	sourceImg: HTMLImageElement,
	container: HTMLElement,
	viewportWidth: number,
	viewportHeight: number,
	fileName: string,
	onResult: (url: string) => void
): void {
	// Scale down only when the thumbnail exceeds the viewport.
	// Small images are kept at their original pixel size.
	const scale = Math.min(
		1,
		viewportWidth / sourceImg.naturalWidth,
		viewportHeight / sourceImg.naturalHeight
	);
	const drawWidth = sourceImg.naturalWidth * scale;
	const drawHeight = sourceImg.naturalHeight * scale;

	// Round coordinates to whole CSS pixels to avoid subpixel blur.
	const x = Math.round((viewportWidth - drawWidth) / 2);
	const y = Math.round((viewportHeight - drawHeight) / 2);

	// Render at device pixel density so the image stays sharp on HiDPI screens.
	const dpr = window.devicePixelRatio || 1;
	const canvas = createEl('canvas');
	canvas.width = Math.round(viewportWidth * dpr);
	canvas.height = Math.round(viewportHeight * dpr);

	const ctx = canvas.getContext('2d');
	if (!ctx) {
		throw new Error('canvas context not available');
	}
	ctx.scale(dpr, dpr);

	// Fill the viewport with white so the entire area is part of the image.
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, viewportWidth, viewportHeight);

	// For small thumbnails drawn at their original size, disable canvas
	// smoothing so source pixels stay crisp on HiDPI screens.
	const isNaturalSize = Math.abs(scale - 1) < 0.001;
	ctx.imageSmoothingEnabled = !isNaturalSize;

	// Center the thumbnail inside the white viewport.
	ctx.drawImage(sourceImg, x, y, drawWidth, drawHeight);

	// Encode the canvas as a data URI (base64). Unlike blob URLs, data URIs
	// never expire and can always be re-loaded by Obsidian's Lightbox.
	const resultUrl = canvas.toDataURL('image/png');

	const img = createEl('img');
	// Use the xmind file name (without extension) as alt text so
	// Obsidian's image Lightbox (v1.13.4+) displays it as the title.
	img.alt = fileName.replace(/\.xmind$/i, '');
	img.className = 'xmind-viewer-thumbnail-img';
	// Keep the displayed size locked to the viewport so the high-DPI
	// canvas is not stretched by the browser.
	img.style.width = `${viewportWidth}px`;
	img.style.height = `${viewportHeight}px`;
	if (isNaturalSize) {
		img.addClass('xmind-viewer-thumbnail-pixelated');
	}
	img.src = resultUrl;
	container.appendChild(img);
	onResult(resultUrl);
}

/**
 * Render an XMind thumbnail image into `el`.
 *
 * Obsidian's markdown post-processor runs on elements that are not yet
 * attached to the document. The container may have 0×0 dimensions when
 * the async image load completes. We use requestAnimationFrame to defer
 * drawing until the container is connected and measurable, which avoids
 * both polling and the 0×0 canvas blank-image problem.
 */
export function renderThumbnail(
	el: HTMLElement,
	file: TFile,
	fileData: ArrayBuffer,
	plugin: XMindViewerPlugin,
	options: ThumbnailRenderOptions
): () => void {
	const container = createDiv();
	container.className = 'xmind-viewer-thumbnail';
	container.style.height = options.viewerHeight;
	el.appendChild(container);

	// Fast path: reuse a previously rendered canvas data URI. Skips the
	// unzip → Image → canvas → toDataURL pipeline entirely. This is the
	// critical path for Obsidian's Reading Mode virtual scroller, which
	// repeatedly unloads and reloads the same section as the user scrolls.
	//
	// Data URIs are self-contained and never expire, so the cache entry
	// can be reused by multiple <img> elements and Obsidian's Lightbox
	// without any lifecycle management.
	const cached = plugin.lookupThumbnail(file);
	if (cached) {
		const img = createEl('img');
		img.alt = options.fileName.replace(/\.xmind$/i, '');
		img.className = 'xmind-viewer-thumbnail-img';
		img.style.width = `${cached.width}px`;
		img.style.height = `${cached.height}px`;
		img.src = cached.url;
		container.appendChild(img);
		return () => {
			el.empty();
		};
	}

	// Slow path: unzip + canvas render, then register the result.
	let sourceUrl: string | null = null;
	let cancelled = false;

	extractThumbnail(fileData).then(bytes => {
		if (cancelled) return;

		const mime = bytes[0] === 0x89 ? 'image/png' : 'image/jpeg';
		sourceUrl = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: mime }));

		const sourceImg = new Image();
		sourceImg.onload = () => {
			if (cancelled) return;

			// The container may not be in the DOM yet when onload fires
			// (Obsidian's post-processor runs on detached elements).
			// Wait for it to be connected and have non-zero dimensions
			// before drawing, using requestAnimationFrame to avoid polling.
			const drawWhenReady = () => {
				if (cancelled) return;

				const viewportWidth = container.clientWidth;
				const viewportHeight = container.clientHeight;

				if (!container.isConnected || viewportWidth === 0 || viewportHeight === 0) {
					// Container not ready yet. Schedule another check on the next
					// animation frame. This naturally stops when the container
					// becomes visible or when cancelled is set by onunload.
					window.requestAnimationFrame(drawWhenReady);
					return;
				}

				drawToCanvas(sourceImg, container, viewportWidth, viewportHeight, options.fileName, (url) => {
					// Cache the data URI for fast path reuse on re-renders.
					// Data URIs don't need lifecycle management — they're
					// just strings, garbage-collected when the cache entry
					// is evicted.
					plugin.registerThumbnail(file, url, viewportWidth, viewportHeight);
				});
			};
			drawWhenReady();
		};
		sourceImg.onerror = () => {
			throw new Error('failed to load thumbnail image');
		};
		sourceImg.src = sourceUrl;
	}).catch(e => {
		if (cancelled) return;
		container.empty();
		const errorEl = createDiv();
		errorEl.className = 'xmind-viewer-error';
		errorEl.textContent = t('error.thumbnailFailed', { message: e instanceof Error ? e.message : String(e) });
		el.appendChild(errorEl);
	});

	return () => {
		cancelled = true;
		// sourceUrl is the raw thumbnail blob (pre-canvas); always revoke.
		if (sourceUrl) URL.revokeObjectURL(sourceUrl);
		// The canvas result is a data URI stored in the cache. Data URIs
		// are self-contained strings — no revoke needed, and the Lightbox
		// can always re-load them even after this <img> is unloaded.
		el.empty();
	};
}
