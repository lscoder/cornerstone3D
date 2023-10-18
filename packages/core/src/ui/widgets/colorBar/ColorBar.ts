import { vec2 } from 'gl-matrix';
import { utilities, Types } from '@cornerstonejs/core';
import { EventListenersManager } from './EventListeners';
import { Widget } from '../Widget';
import { ColorBarProps, ColorBarVOIRange, Colormap } from './types';
import { ColorBarOrientation } from './enums';
import ColorBarCanvas from './ColorBarCanvas';

const DEFAULT_MULTIPLIER = 1;

type ColorBarPoints = {
  page: Types.Point2;
  client: Types.Point2;
  local: Types.Point2;
};

class ColorBar extends Widget {
  private _canvas: HTMLCanvasElement;
  private _colormaps: Map<string, Colormap>;
  private _activeColormapName: string;
  private _eventListenersManager: EventListenersManager;
  private _colorBarCanvas: ColorBarCanvas;

  constructor(props: ColorBarProps) {
    super(props);

    const { colormaps, activeColormapName } = props;

    this._eventListenersManager = new EventListenersManager();
    this._colormaps = colormaps.reduce(
      (items, item) => items.set(item.Name, item),
      new Map<string, Colormap>()
    );
    this._activeColormapName = activeColormapName ?? colormaps?.[0]?.Name;

    this._colorBarCanvas = this._createColorBarCanvas(props);
    this._colorBarCanvas.appendTo(this.rootElement);

    this._addRootElementEventListeners();
  }

  /**
   * Returns the active LUT name
   */
  public get activeColormapName() {
    return this._activeColormapName;
  }

  /**
   * Set the current active LUT name and re-renders the color bar
   */
  public set activeColormapName(colormapName: string) {
    if (colormapName === this._activeColormapName) {
      return;
    }

    const colormap = this._colormaps.get(colormapName);

    if (!colormap) {
      console.warn(`Invalid colormap name (${colormapName})`);
      return;
    }

    this._activeColormapName = colormapName;
    this._colorBarCanvas.colormap = colormap;
  }

  public get orientation() {
    return this._colorBarCanvas.orientation;
  }

  public set orientation(orientation: ColorBarOrientation) {
    this._colorBarCanvas.orientation = orientation;
  }

  public get range() {
    return this._colorBarCanvas.range;
  }

  public set range(range: ColorBarVOIRange) {
    this._colorBarCanvas.range = range;
  }

  public get voiRange() {
    return this._colorBarCanvas.voiRange;
  }

  public set voiRange(voiRange: ColorBarVOIRange) {
    const { voiRange: currentVoiRange } = this._colorBarCanvas;
    const { lower: currentLower, upper: currentUpper } = currentVoiRange;

    if (voiRange.lower === currentLower && voiRange.upper == currentUpper) {
      return;
    }

    this._colorBarCanvas.voiRange = voiRange;
    this.voiChanged(this._colorBarCanvas.voiRange);
  }

  public dispose() {
    super.dispose();
    this._removeRootElementEventListeners();
  }

  protected createRootElement(): HTMLElement {
    const rootElement = document.createElement('div');

    Object.assign(rootElement.style, {
      width: '100%',
      height: '100%',
    });

    return rootElement;
  }

  protected containerResized() {
    super.containerResized();
    this._colorBarCanvas.size = this.containerSize;
  }

  protected getVOIMultipliers(): [number, number] {
    return [DEFAULT_MULTIPLIER, DEFAULT_MULTIPLIER];
  }

  protected voiChanged(voiRange: ColorBarVOIRange) {
    // TODO: override voiRange property?
  }

  private _createColorBarCanvas(props: ColorBarProps) {
    const { range, voiRange, orientation } = props;
    const colormap = this._colormaps.get(this._activeColormapName);

    return new ColorBarCanvas({
      colormap,
      range,
      voiRange,
      orientation,
    });
  }

  private _getPointsFromMouseEvent(evt: MouseEvent): ColorBarPoints {
    const { rootElement: element } = this;
    const clientPoint: Types.Point2 = [evt.clientX, evt.clientY];
    const pagePoint: Types.Point2 = [evt.pageX, evt.pageY];
    const rect = element.getBoundingClientRect();
    const localPoints: Types.Point2 = [
      pagePoint[0] - rect.left - window.pageXOffset,
      pagePoint[1] - rect.top - window.pageYOffset,
    ];

    return { client: clientPoint, page: pagePoint, local: localPoints };
  }

  private _mouseOverCallback = (evt) => {
    // const { rootElement: element } = this;
    // evt.stopPropagation();
  };

  private _mouseOutCallback = (evt) => {
    // const { rootElement: element } = this;
    // evt.stopPropagation();
  };

  private _mouseDownCallback = (evt: MouseEvent) => {
    this._addVOIEventListeners(evt);
    evt.stopPropagation();
  };

  private _mouseDragCallback = (evt, initialState) => {
    const multipliers = this.getVOIMultipliers();
    const currentPoints = this._getPointsFromMouseEvent(evt);
    const { points: startPoints, voiRange: startVOIRange } = initialState;
    const canvasDelta = vec2.sub(
      vec2.create(),
      currentPoints.local,
      startPoints.local
    );

    const wwDelta = canvasDelta[0] * multipliers[0];
    const wcDelta = canvasDelta[1] * multipliers[1];

    if (!wwDelta && !wcDelta) {
      return;
    }

    const { lower: voiLower, upper: voiUpper } = startVOIRange;
    let { windowWidth, windowCenter } = utilities.windowLevel.toWindowLevel(
      voiLower,
      voiUpper
    );

    windowWidth = Math.max(windowWidth + wwDelta, 1);
    windowCenter += wcDelta;

    const newVoiRange = utilities.windowLevel.toLowHighRange(
      windowWidth,
      windowCenter
    );

    this.voiRange = newVoiRange;
    evt.stopPropagation();
  };

  private _mouseUpCallback = (evt) => {
    this._removeVOIEventListeners();
    evt.stopPropagation();
  };

  private _addRootElementEventListeners() {
    const { rootElement: element } = this;

    this._removeRootElementEventListeners();
    element.addEventListener('mouseover', this._mouseOverCallback);
    element.addEventListener('mouseout', this._mouseOutCallback);
    element.addEventListener('mousedown', this._mouseDownCallback);
  }

  private _removeRootElementEventListeners() {
    const { rootElement: element } = this;

    element.removeEventListener('mouseover', this._mouseOverCallback);
    element.removeEventListener('mouseout', this._mouseOutCallback);
    element.removeEventListener('mousedown', this._mouseDownCallback);
  }

  private _addVOIEventListeners(evt: MouseEvent) {
    const { _eventListenersManager: manager } = this;
    const points = this._getPointsFromMouseEvent(evt);
    const voiRange = { ...this._colorBarCanvas.voiRange };
    const initialDragState = { points, voiRange };

    this._removeVOIEventListeners();

    document.addEventListener('mouseup', this._mouseUpCallback);
    manager.addEventListener(document, 'colorbar.voi.mousemove', (evt) =>
      this._mouseDragCallback(evt, initialDragState)
    );
  }

  private _removeVOIEventListeners() {
    const { _eventListenersManager: manager } = this;

    document.removeEventListener('mouseup', this._mouseUpCallback);
    manager.removeEventListener(document, 'colorbar.voi.mousemove');
  }
}

export { ColorBar as default, ColorBar };
