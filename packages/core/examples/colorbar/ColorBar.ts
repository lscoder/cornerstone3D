import { vec2 } from 'gl-matrix';
import { utilities, Types } from '@cornerstonejs/core';
import { EventListenersManager } from './EventListeners';

const DEFAULT_MULTIPLIER = 4;

type WidgetPoints = {
  page: Types.Point2;
  client: Types.Point2;
  local: Types.Point2;
};

export enum ColorBarOrientation {
  Auto = 'auto',
  Vertical = 'vertical',
  Horizontal = 'horizontal',
}

export type ColorBarRange = {
  lower: number;
  upper: number;
};

export type ColorBarVOIRange = ColorBarRange;

export type Colormap = {
  ColorSpace: string;
  Name: string;
  RGBPoints: number[];
};

export interface ColorBarProps {
  id?: string;
  colormaps: Colormap[];
  activeColormapName?: string;
  range?: ColorBarRange;
  voiRange?: ColorBarVOIRange;
  orientation?: ColorBarOrientation;
}

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

class ColorBar {
  private _id: string;
  private _rootElement: HTMLElement;
  private _canvas: HTMLCanvasElement;
  private _colormaps: Map<string, Colormap>;
  private _activeColormapName: string;
  private _range: ColorBarRange;
  private _voiRange: ColorBarVOIRange;
  private _orientation: ColorBarOrientation;
  private _containerResizeObserver: ResizeObserver;
  private _eventListenersManager: EventListenersManager;

  constructor({
    id,
    colormaps,
    activeColormapName,
    range = { lower: 0, upper: 1 },
    voiRange = { lower: 0, upper: 1 },
    orientation = ColorBarOrientation.Auto,
  }: ColorBarProps) {
    this._id = id;
    this._rootElement = this.createRootElement();
    this._eventListenersManager = new EventListenersManager();
    this._canvas = this._createCanvasElement(id);
    this._range = getValidRange(range);
    this._voiRange = getValidRange(voiRange);
    this._orientation = orientation;
    this._colormaps = colormaps.reduce(
      (items, item) => items.set(item.Name, item),
      new Map<string, Colormap>()
    );
    this._activeColormapName = activeColormapName ?? colormaps?.[0]?.Name;
    this._containerResizeObserver = new ResizeObserver(
      this._containerResizeCallback
    );

    // DEBUG
    this._rootElement.id = `colorBarRoot_${id}`;

    this.init();
  }

  public get id() {
    return this._id;
  }

  public set id(id) {
    if (id === this._id) {
      return;
    }

    this._id = id;
    this._canvas.id = id;
  }

  public get rootElement() {
    return this._rootElement;
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
    this.onVOIChanged(this._voiRange);
    this.render();
  }

  /**
   * Append the color bar node to a parent element and re-renders the color bar
   * @param container - HTML element where the color bar will be added to
   */
  public appendTo(container: HTMLElement) {
    const {
      _rootElement: rootElement,
      _containerResizeObserver: resizeObserver,
    } = this;
    const { parentElement: currentContainer } = rootElement;

    if (!container || container === currentContainer) {
      return;
    }

    if (currentContainer) {
      resizeObserver.unobserve(currentContainer);
    }

    container.appendChild(rootElement);
    resizeObserver.observe(container);
  }

  /**
   * Render the color bar using the active LUT
   */
  public render(): void {
    if (!this._rootElement.isConnected || !this._activeColormapName) {
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
    const { windowWidth } = utilities.windowLevel.toWindowLevel(
      voiRange.lower,
      voiRange.upper
    );
    // const windowWidth = voiRange.upper - voiRange.lower;
    console.log('>>>>> render :: windowWidth ::', windowWidth);
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

  /**
   * Removes the canvas from the DOM and stop listening to DOM events
   */
  public dispose() {
    const {
      _rootElement: rootElement,
      _containerResizeObserver: resizeObserver,
    } = this;
    const { parentElement } = rootElement;

    parentElement?.removeChild(rootElement);
    resizeObserver.disconnect();
    this._removeRootElementEventListeners();
  }

  protected init() {
    this._addRootElementEventListeners();
    this._rootElement.appendChild(this._canvas);
  }

  protected createRootElement(): HTMLElement {
    const rootElement = document.createElement('div');

    Object.assign(rootElement.style, {
      width: '100%',
      height: '100%',
    });

    return rootElement;
  }

  protected resize(width: number, height: number) {
    const { _canvas: canvas } = this;

    if (canvas.width === width && canvas.height === height) {
      return;
    }

    canvas.width = width;
    canvas.height = height;
    this.render();
  }

  protected onVOIChanged(voiRange: ColorBarVOIRange) {
    // TODO: override voiRange property?
  }

  private _getPointsFromMouseEvent(evt: MouseEvent): WidgetPoints {
    const { _rootElement: element } = this;
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
    // const { _rootElement: element } = this;
    // evt.stopPropagation();
  };

  private _mouseOutCallback = (evt) => {
    // const { _rootElement: element } = this;
    // evt.stopPropagation();
  };

  private _mouseDownCallback = (evt: MouseEvent) => {
    this._addVOIEventListeners(evt);
    evt.stopPropagation();
  };

  private _mouseDragCallback = (evt, initialState) => {
    const multiplier = this.getMultiplier();
    const currentPoints = this._getPointsFromMouseEvent(evt);
    const { points: startPoints, voiRange: startVOIRange } = initialState;
    const canvasDelta = vec2.sub(
      vec2.create(),
      currentPoints.local,
      startPoints.local
    );

    const wwDelta = canvasDelta[0] * multiplier;
    const wcDelta = canvasDelta[1] * multiplier;

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

  protected getMultiplier() {
    return DEFAULT_MULTIPLIER;
  }

  private _mouseUpCallback = (evt) => {
    this._removeVOIEventListeners();
    evt.stopPropagation();
  };

  private _addRootElementEventListeners() {
    const { _rootElement: element } = this;

    this._removeRootElementEventListeners();
    element.addEventListener('mouseover', this._mouseOverCallback);
    element.addEventListener('mouseout', this._mouseOutCallback);
    element.addEventListener('mousedown', this._mouseDownCallback);
  }

  private _removeRootElementEventListeners() {
    const { _rootElement: element } = this;

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

  private _createCanvasElement(id: string) {
    const canvas = document.createElement('canvas');
    canvas.id = id;

    Object.assign(canvas.style, {
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    });

    return canvas;
  }

  private _containerResizeCallback = (entries: ResizeObserverEntry[]): void => {
    let width;
    let height;

    const { contentRect, contentBoxSize } = entries[0];

    // `contentRect` is better supported than `borderBoxSize` or `contentBoxSize`,
    // but it is left over from an earlier implementation of the Resize Observer API
    // and may be deprecated in future versions.
    // https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserverEntry/contentRect
    if (contentRect) {
      width = contentRect.width;
      height = contentRect.height;
    } else if (contentBoxSize?.length) {
      width = contentBoxSize[0].inlineSize;
      height = contentBoxSize[0].blockSize;
    }

    this.resize(width, height);
  };
}

export { ColorBar as default, ColorBar };
