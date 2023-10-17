import ColormapCanvas from './ColormapCanvas';

class ColormapListItem {
  private _canvas: ColormapCanvas;

  constructor() {
    this._canvas = new ColormapCanvas();
  }
}

export { ColormapListItem as default, ColormapListItem };
