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
		viewer.setFitMap();
		// Remove loading placeholder once the mind map is rendered
		if (loadingEl && loadingEl.parentNode) {
			loadingEl.parentNode.removeChild(loadingEl);
		}
	};

	viewer.addEventListener('map-ready', onMapReady);
	viewer.load(fileData);

	return () => {
		viewer.removeEventListener('map-ready', onMapReady);
		el.empty();
	};
}
