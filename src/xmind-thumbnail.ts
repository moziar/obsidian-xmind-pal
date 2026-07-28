import { unzip, Unzipped } from 'fflate';
import { t } from './i18n';

const THUMBNAIL_PATHS = [
	'Thumbnails/thumbnail.png',
	'Thumbnails/thumbnail.jpg',
	'thumbnails/thumbnail.png',
	'thumbnails/thumbnail.jpg',
];

function extractThumbnail(fileData: ArrayBuffer): Promise<Uint8Array> {
	const compressed = new Uint8Array(fileData);
	return new Promise<Unzipped>((resolve, reject) => {
		unzip(compressed, (err, files) => {
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
}

/**
 * Draw the source image onto a canvas inside `container`.
 * Called once the container is connected and has non-zero dimensions.
 */
function drawToCanvas(
	sourceImg: HTMLImageElement,
	container: HTMLElement,
	viewportWidth: number,
	viewportHeight: number,
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
	const canvas = document.createElement('canvas');
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

	// Encode the canvas as a blob URL instead of base64 to reduce memory
	// pressure and avoid a second base64 round trip.
	canvas.toBlob((blob) => {
		if (!blob) {
			throw new Error('canvas toBlob failed');
		}
		const resultUrl = URL.createObjectURL(blob);

		const img = document.createElement('img');
		img.alt = t('ui.mindMapThumbnail');
		img.className = 'xmind-viewer-thumbnail-img';
		// Keep the displayed size locked to the viewport so the high-DPI
		// canvas is not stretched by the browser.
		img.style.width = `${viewportWidth}px`;
		img.style.height = `${viewportHeight}px`;
		if (isNaturalSize) {
			img.style.imageRendering = 'pixelated';
		}
		img.src = resultUrl;
		container.appendChild(img);
		onResult(resultUrl);
	}, 'image/png');
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
	fileData: ArrayBuffer,
	options: ThumbnailRenderOptions
): () => void {
	const container = document.createElement('div');
	container.className = 'xmind-viewer-thumbnail';
	container.style.height = options.viewerHeight;
	el.appendChild(container);

	let sourceUrl: string | null = null;
	let resultUrl: string | null = null;
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
					requestAnimationFrame(drawWhenReady);
					return;
				}

				drawToCanvas(sourceImg, container, viewportWidth, viewportHeight, (url) => {
					resultUrl = url;
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
		const errorEl = document.createElement('div');
		errorEl.className = 'xmind-viewer-error';
		errorEl.textContent = t('error.thumbnailFailed', { message: e instanceof Error ? e.message : String(e) });
		el.appendChild(errorEl);
	});

	return () => {
		cancelled = true;
		if (sourceUrl) URL.revokeObjectURL(sourceUrl);
		if (resultUrl) URL.revokeObjectURL(resultUrl);
		el.empty();
	};
}
