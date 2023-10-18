import { vec2 } from 'gl-matrix';
import { utilities, Types } from '@cornerstonejs/core';
import { EventListenersManager } from './EventListeners';
import { Widget } from '../Widget';
import {
  ColorBarProps,
  ColorBarRange,
  ColorBarVOIRange,
  Colormap,
} from './types';
import { ColorBarOrientation } from './enums';
import ColorBarCanvas from './ColorBarCanvas';

const DEFAULT_MULTIPLIER = 1;

type ColorBarPoints = {
  page: Types.Point2;
  client: Types.Point2;
  local: Types.Point2;
};

const clamp = (value, min, max) => Math.min(Math.max(min, value), max);

const interpolateVec3 = (a, b, t) => {
  return [
    a[0] * (1 - t) + b[0] * t,
    a[1] * (1 - t) + b[1] * t,
    a[2] * (1 - t) + b[2] * t,
  ];
};

const getValidRange = (range: ColorBarRange) => ({
  ...range,
  upper: Math.max(range.lower + 1, range.upper),
});

class ColorBar extends Widget {
  private _canvas: HTMLCanvasElement;
  private _colormaps: Map<string, Colormap>;
  private _activeColormapName: string;
  private _range: ColorBarRange;
  private _voiRange: ColorBarVOIRange;
  private _orientation: ColorBarOrientation;
  private _eventListenersManager: EventListenersManager;
  private _colorBarCanvas: ColorBarCanvas;

  constructor(props: ColorBarProps) {
    super(props);

    const {
      colormaps,
      activeColormapName,
      range = { lower: 0, upper: 1 },
      voiRange = { lower: 0, upper: 1 },
      orientation = ColorBarOrientation.Auto,
    } = props;

    this._eventListenersManager = new EventListenersManager();
    this._canvas = this._createCanvasElement();
    this._range = getValidRange(range);
    this._voiRange = getValidRange(voiRange);
    this._orientation = orientation;
    this._colormaps = colormaps.reduce(
      (items, item) => items.set(item.Name, item),
      new Map<string, Colormap>()
    );
    this._activeColormapName = activeColormapName ?? colormaps?.[0]?.Name;

    this._addRootElementEventListeners();
    this.rootElement.appendChild(this._canvas);

    this._colorBarCanvas = this._createColorBarCanvas(props);
    this._colorBarCanvas.appendTo(this.rootElement);
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
    if (!colormapName || colormapName === this._activeColormapName) {
      return;
    }

    const colormap = this._colormaps.get(colormapName);

    if (!colormap) {
      console.warn(`Invalid colormap name (${colormapName})`);
      return;
    }

    this._colorBarCanvas.colormap = colormap;
    this._activeColormapName = colormapName;
    this.render();
  }

  public get orientation() {
    return this._orientation;
  }

  public set orientation(orientation: ColorBarOrientation) {
    if (orientation === this._orientation) {
      return;
    }

    this._orientation = orientation;
    this.render();

    this._colorBarCanvas.orientation = orientation;
  }

  public get range() {
    return { ...this._range };
  }

  public set range(range: ColorBarVOIRange) {
    const { lower: currentLower, upper: currentUpper } = this._range;

    if (currentLower === range.lower && currentUpper === range.upper) {
      return;
    }

    this._range = getValidRange(range);
    this.render();

    this._colorBarCanvas.range = range;
  }

  public get voiRange() {
    return { ...this._voiRange };
  }

  public set voiRange(voiRange: ColorBarVOIRange) {
    const { lower: currentLower, upper: currentUpper } = this._voiRange;

    if (currentLower === voiRange.lower && currentUpper === voiRange.upper) {
      return;
    }

    this._voiRange = getValidRange(voiRange);
    this.voiChanged(this._voiRange);
    this.render();

    this._colorBarCanvas.voiRange = voiRange;
  }

  /**
   * Render the color bar using the active LUT
   */
  public render(): void {
    if (!this.rootElement.isConnected || !this._activeColormapName) {
      return;
    }

    const colormap = this._colormaps.get(this._activeColormapName);

    if (!colormap) {
      console.warn(`Invalid colormap name (${this._activeColormapName})`);
      return;
    }

    const { RGBPoints: rgbPoints } = colormap;
    const colorsCount = rgbPoints.length / 4;

    const getColorPoint = (index) => {
      const offset = 4 * index;

      if (index < 0 || index >= colorsCount) {
        return;
      }

      return {
        index,
        position: rgbPoints[offset],
        color: [
          rgbPoints[offset + 1],
          rgbPoints[offset + 2],
          rgbPoints[offset + 3],
        ],
      };
    };

    const { _range: range, _voiRange: voiRange } = this;
    // const { _voiRange: voiRange } = this;
    // const range = { ...voiRange };
    const { windowWidth } = utilities.windowLevel.toWindowLevel(
      voiRange.lower,
      voiRange.upper
    );
    const { width, height } = this._canvas;
    const canvasContext = this._canvas.getContext('2d');
    const isHorizontal =
      this._orientation === ColorBarOrientation.Horizontal ||
      (this._orientation === ColorBarOrientation.Auto && width >= height);
    const maxValue = isHorizontal ? width : height;

    let previousColorPoint = undefined;
    let currentColorPoint = getColorPoint(0);

    // const tRangeInc = 1 / (maxValue - 1);
    // let tRange = 0;
    const incRawPixelValue = (range.upper - range.lower) / (maxValue - 1);
    let rawPixelValue = range.lower;

    // const debugValues = [];
    // (window as any).values = debugValues;

    for (let i = 0; i < maxValue; i++) {
      const tVoiRange = (rawPixelValue - voiRange.lower) / windowWidth;
      // debugValues.push(tVoiRange);

      // Find the color in a linear way (O(n) complexity).
      // currentColorPoint shall move to the next color until tVoiRange is smaller
      // than or equal to next color position.
      if (currentColorPoint) {
        for (let i = currentColorPoint.index; i < colorsCount; i++) {
          if (tVoiRange <= currentColorPoint.position) {
            break;
          }

          previousColorPoint = currentColorPoint;
          currentColorPoint = getColorPoint(i + 1);
        }
      }

      let normColor;

      // For:
      //   - firstColorPoint = getColorPoint(0)
      //   - secondColorPoint = getColorPoint(1)
      //   - lastColorPoint = getColorPoint(colorsCount - 1)
      // Then
      //   - previousColorPoint shall be undefined when tVoiRange < firstColorPoint.position
      //   - currentColorPoint shall be undefined when tVoiRange > lastColorPoint.position
      //   - previousColorPoint and currentColorPoint will be defined when
      //     currentColorPoint.position is between secondColorPoint.position and
      //     lastColorPoint.position.
      if (!previousColorPoint) {
        normColor = [...currentColorPoint.color];
      } else if (!currentColorPoint) {
        normColor = [...previousColorPoint.color];
      } else {
        const tColorRange =
          (tVoiRange - previousColorPoint.position) /
          (currentColorPoint.position - previousColorPoint.position);

        normColor = interpolateVec3(
          previousColorPoint.color,
          currentColorPoint.color,
          tColorRange
        );
      }

      const color = normColor.map((color) =>
        clamp(Math.round(color * 255), 0, 255)
      );

      canvasContext.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

      if (isHorizontal) {
        canvasContext.fillRect(i, 0, 1, height);
      } else {
        canvasContext.fillRect(0, height - i - 1, width, 1);
      }

      // tRange += tRangeInc;
      rawPixelValue += incRawPixelValue;
    }

    // console.log('>>>>> debugValues ::', debugValues);
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

    const { _canvas: canvas } = this;
    const { width, height } = this.containerSize;

    canvas.width = width;
    canvas.height = height;

    this._colorBarCanvas.size = { width, height };
    this.render();
  }

  protected getVOIMultipliers(): [number, number] {
    return [DEFAULT_MULTIPLIER, DEFAULT_MULTIPLIER];
  }

  protected voiChanged(voiRange: ColorBarVOIRange) {
    // TODO: override voiRange property?
  }

  private _createCanvasElement() {
    const canvas = document.createElement('canvas');

    Object.assign(canvas.style, {
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    });

    return canvas;
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

    console.log('>>>>> drag :: newVoiRange :: ', newVoiRange);
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
    const voiRange = { ...this._voiRange };
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
