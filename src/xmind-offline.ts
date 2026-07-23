import { unzipSync, strFromU8 } from 'fflate';
import { XMindViewerSettings } from './main';
import { t } from './i18n';

interface XMindTopic {
	id: string;
	title: string;
	children?: { attached?: XMindTopic[]; detached?: XMindTopic[] };
}

interface XMindSheet {
	id: string;
	title: string;
	rootTopic: XMindTopic;
	theme?: Record<string, unknown>;
}

interface TreeNode {
	title: string;
	children: TreeNode[];
	depth: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

const NODE_HEIGHT = 28;
const V_SPACING = 8;
const LEVEL_WIDTH = 220;
const H_PADDING = 16;
const SVG_PADDING = 20;

function parseXmindFile(fileData: ArrayBuffer): XMindSheet[] {
	const compressed = new Uint8Array(fileData);
	const files = unzipSync(compressed);
	const contentBytes = files['content.json'];
	if (!contentBytes) {
		throw new Error('content.json not found in xmind file');
	}
	const contentJson = strFromU8(contentBytes);
	return JSON.parse(contentJson);
}

function buildTree(topic: XMindTopic, depth: number = 0): TreeNode {
	const attached = topic.children?.attached ?? [];
	return {
		title: topic.title || '',
		depth,
		x: 0,
		y: 0,
		width: 0,
		height: NODE_HEIGHT,
		children: attached.map(c => buildTree(c, depth + 1)),
	};
}

function estimateTextWidth(text: string): number {
	return Math.max(60, text.length * 8 + H_PADDING * 2);
}

function layoutTree(root: TreeNode): { width: number; height: number } {
	let leafIndex = 0;
	let maxDepth = 0;

	function calculatePositions(node: TreeNode): void {
		node.width = estimateTextWidth(node.title);
		maxDepth = Math.max(maxDepth, node.depth);

		if (node.children.length === 0) {
			node.y = leafIndex * (NODE_HEIGHT + V_SPACING);
			leafIndex++;
		} else {
			node.children.forEach(calculatePositions);
			const firstChild = node.children[0];
			const lastChild = node.children[node.children.length - 1];
			node.y = (firstChild.y + lastChild.y) / 2;
		}
	}

	calculatePositions(root);

	function setX(node: TreeNode): void {
		node.x = node.depth * LEVEL_WIDTH;
		node.children.forEach(setX);
	}
	setX(root);

	const totalWidth = (maxDepth + 1) * LEVEL_WIDTH + SVG_PADDING * 2;
	const totalHeight = leafIndex * (NODE_HEIGHT + V_SPACING) + SVG_PADDING * 2;

	return { width: totalWidth, height: totalHeight };
}

function createSvgElement(tag: string, attrs: Record<string, string>): Element {
	const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
	for (const [key, value] of Object.entries(attrs)) {
		el.setAttribute(key, value);
	}
	return el;
}

function renderNodeSVG(node: TreeNode, isRoot: boolean): Element {
	const x = node.x + SVG_PADDING;
	const y = node.y + SVG_PADDING;
	const fillColor = isRoot ? 'var(--interactive-accent)' : 'var(--background-secondary)';
	const textColor = isRoot ? 'var(--text-on-accent)' : 'var(--text-normal)';

	const group = createSvgElement('g', {});

	// Connection lines to children
	for (const child of node.children) {
		const cx = child.x + SVG_PADDING;
		const cy = child.y + SVG_PADDING;
		const midX = (x + node.width + cx) / 2;
		const path = createSvgElement('path', {
			d: `M ${x + node.width} ${y + NODE_HEIGHT / 2} C ${midX} ${y + NODE_HEIGHT / 2}, ${midX} ${cy + NODE_HEIGHT / 2}, ${cx} ${cy + NODE_HEIGHT / 2}`,
			fill: 'none',
			stroke: 'var(--background-modifier-border)',
			'stroke-width': '1.5',
		});
		group.appendChild(path);
	}

	// Node rectangle
	const rect = createSvgElement('rect', {
		x: String(x),
		y: String(y),
		width: String(node.width),
		height: String(NODE_HEIGHT),
		rx: '4',
		fill: fillColor,
		stroke: 'var(--background-modifier-border)',
		'stroke-width': '1',
	});
	group.appendChild(rect);

	// Node text
	const text = createSvgElement('text', {
		x: String(x + H_PADDING),
		y: String(y + NODE_HEIGHT / 2 + 5),
		fill: textColor,
		'font-size': '13',
		'font-weight': isRoot ? 'bold' : 'normal',
		'font-family': 'var(--font-interface)',
	});
	text.textContent = node.title;
	group.appendChild(text);

	// Render children
	for (const child of node.children) {
		group.appendChild(renderNodeSVG(child, false));
	}

	return group;
}

function renderSheetSVG(sheet: XMindSheet): HTMLElement {
	const tree = buildTree(sheet.rootTopic);
	const { width, height } = layoutTree(tree);

	const container = document.createElement('div');
	container.className = 'xmind-viewer-offline';

	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', '100%');
	svg.setAttribute('height', '100%');
	svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
	svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
	svg.appendChild(renderNodeSVG(tree, true));

	container.appendChild(svg);
	return container;
}

export function renderOffline(
	el: HTMLElement,
	fileData: ArrayBuffer,
	settings: XMindViewerSettings
): () => void {
	let sheets: XMindSheet[];
	try {
		sheets = parseXmindFile(fileData);
	} catch (e) {
		const errorEl = document.createElement('div');
		errorEl.className = 'xmind-viewer-error';
		errorEl.textContent = t('error.parseFailed', { message: e instanceof Error ? e.message : String(e) });
		el.appendChild(errorEl);
		return () => el.empty();
	}

	if (sheets.length === 0) {
		const errorEl = document.createElement('div');
		errorEl.className = 'xmind-viewer-error';
		errorEl.textContent = t('error.noSheets');
		el.appendChild(errorEl);
		return () => el.empty();
	}

	// Single sheet — render directly
	if (sheets.length === 1) {
		const sheetEl = renderSheetSVG(sheets[0]);
		sheetEl.style.height = settings.viewerHeight;
		el.appendChild(sheetEl);
		return () => el.empty();
	}

	// Multiple sheets — render tab bar
	const wrapper = document.createElement('div');
	wrapper.className = 'xmind-viewer-offline-wrapper';

	const tabBar = document.createElement('div');
	tabBar.className = 'xmind-viewer-tabs';
	const contentArea = document.createElement('div');
	contentArea.style.height = settings.viewerHeight;

	function showSheet(index: number) {
		contentArea.empty();
		const sheetEl = renderSheetSVG(sheets[index]);
		contentArea.appendChild(sheetEl);

		tabBar.querySelectorAll('.xmind-viewer-tab').forEach((tab, i) => {
			tab.toggleClass('is-active', i === index);
		});
	}

	sheets.forEach((sheet, index) => {
		const tab = document.createElement('div');
		tab.className = 'xmind-viewer-tab';
		if (index === 0) tab.addClass('is-active');
		tab.textContent = sheet.title || t('ui.sheetLabel', { index: index + 1 });
		tab.addEventListener('click', () => showSheet(index));
		tabBar.appendChild(tab);
	});

	wrapper.appendChild(tabBar);
	wrapper.appendChild(contentArea);
	el.appendChild(wrapper);

	showSheet(0);

	return () => el.empty();
}
