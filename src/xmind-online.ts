import { XMindEmbedViewer } from 'xmind-embed-viewer';
import { XMindViewerSettings } from './main';

export function renderOnline(
	el: HTMLElement,
	fileData: ArrayBuffer,
	settings: XMindViewerSettings,
	loadingEl?: HTMLElement
): () => void {
	const viewer = new XMindEmbedViewer({
		el: el,
		region: settings.region,
		styles: {
			width: '100%',
			height: settings.viewerHeight,
		},
	});

	const onMapReady = () => {
		// The viewer may report map-ready before its internal layout metrics are
		// fully stable, especially when the container starts with zero/zero-ish
		// dimensions. Defer fitMap and apply it a second time to avoid NaN zoom
		// and misaligned nodes.
		let placeholderRemoved = false;
		const fitAndCleanup = () => {
			viewer.setFitMap();
			if (!placeholderRemoved && loadingEl?.parentNode) {
				loadingEl.parentNode.removeChild(loadingEl);
				placeholderRemoved = true;
			}
		};

		requestAnimationFrame(fitAndCleanup);
		window.setTimeout(fitAndCleanup, 100);
	};

	viewer.addEventListener('map-ready', onMapReady);
	viewer.load(fileData);

	return () => {
		viewer.removeEventListener('map-ready', onMapReady);
		el.empty();
	};
}
