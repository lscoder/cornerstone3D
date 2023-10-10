export enum ColorBarOrientation {
  Vertical,
  Horizontal,
}

export type ColobarVOIRange = {
  min: number;
  max: number;
};

export type Colormap = {
  ColorSpace: string;
  Name: string;
  RGBPoints: number[];
};

export type ColorBarData = {
  id?: string;
  colormaps: Colormap[];
  activeColormapName?: string;
  voiRange?: ColobarVOIRange;
  orientation?: ColorBarOrientation;
};

const clamp = (value, min, max) => Math.min(Math.max(min, value), max);

const interpolateVec3 = (a, b, t) => {
  return [
    a[0] * (1 - t) + b[0] * t,
    a[1] * (1 - t) + b[1] * t,
    a[2] * (1 - t) + b[2] * t,
  ];
};

class ColorBar {
  private _id: string;
  private _canvas: HTMLCanvasElement;
  private _colormaps: Map<string, Colormap>;
  private _activeColormapName: string;
  private _voiRange: ColobarVOIRange;
  private _orientation: ColorBarOrientation;
  private _containerResizeObserver: ResizeObserver;

  constructor({
    id,
    colormaps,
    activeColormapName,
    voiRange,
    orientation,
  }: ColorBarData) {
    this._id = id;
    this._canvas = this._createCanvasElement(id);
    this._colormaps = colormaps.reduce(
      (items, item) => items.set(item.Name, item),
      new Map<string, Colormap>()
    );
    this._activeColormapName = activeColormapName ?? colormaps?.[0]?.Name;
    this._voiRange = voiRange ?? { min: 0, max: 1 };
    this._orientation = orientation;
    this._containerResizeObserver = new ResizeObserver(
      this._containerResizeCallback
    );
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

  public get rootNode() {
    return this._canvas;
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

  /**
   * Append the color bar node to a parent element and re-renders the color bar
   * @param container - HTML element where the color bar will be added to
   */
  public appendTo(container: HTMLElement) {
    const { _canvas: canvas, _containerResizeObserver: resizeObserver } = this;
    const { parentElement: currentContainer } = this._canvas;

    if (!container || container === currentContainer) {
      return;
    }

    if (currentContainer) {
      resizeObserver.unobserve(currentContainer);
    }

    container.appendChild(canvas);

    this._updateCanvasSize();
    resizeObserver.observe(container);
  }

  /**
   * Render the color bar using the active LUT
   */
  public render(): void {
    if (!this._canvas.isConnected || !this._activeColormapName) {
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

      if (index < 0 || index > colorsCount) {
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

    const { _voiRange: voiRange } = this;
    const windowWidth = voiRange.max - voiRange.min;
    const { width, height } = this._canvas;
    const canvasContext = this._canvas.getContext('2d');
    const orientation =
      this._orientation ?? width >= height
        ? ColorBarOrientation.Horizontal
        : ColorBarOrientation.Vertical;
    const maxValue =
      orientation === ColorBarOrientation.Horizontal ? width : height;
    const tRangeInc = 1 / (maxValue - 1);

    let previousColorPoint = undefined;
    let currentColorPoint = getColorPoint(0);
    let tRange = 0;

    for (let i = 0; i < maxValue; i++) {
      const tVoiRange = (tRange - voiRange.min) / windowWidth;

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

      if (orientation === ColorBarOrientation.Horizontal) {
        canvasContext.fillRect(i, 0, 1, height);
      } else {
        canvasContext.fillRect(0, height - i - 1, width, 1);
      }

      tRange += tRangeInc;
    }

    // canvasContext.clearRect(0, 0, width, height);
    // canvasContext.fillStyle = '#00f';
    // canvasContext.strokeStyle = '#0f0';
    // canvasContext.lineWidth = 5;
    // canvasContext.beginPath();
    // canvasContext.rect(0, 0, width, height);
    // canvasContext.fill();
    // canvasContext.stroke();
  }

  /**
   * Removes the canvas from the DOM and stop listening to DOM events
   */
  public dispose() {
    const { _canvas: canvas, _containerResizeObserver: resizeObserver } = this;
    const { parentElement: container } = canvas;

    container?.removeChild(canvas);
    resizeObserver.disconnect();
  }

  private _createCanvasElement(id: string) {
    const canvas = document.createElement('canvas');
    canvas.id = id;

    Object.assign(canvas.style, {
      width: '100%',
      height: '100%',
    });

    return canvas;
  }

  private _updateCanvasSize(width?: number, height?: number) {
    const { _canvas: canvas } = this;

    // In case width or height is not provided it calls getBoundingClientRect()
    // but it is not recommended to call it frequently because it may force layout
    // and degrade the performance.
    if (width === undefined || height === undefined) {
      const boundingBox = canvas.getBoundingClientRect();

      width = boundingBox.width;
      height = boundingBox.height;
    }

    if (canvas.width === width && canvas.height === height) {
      return;
    }

    canvas.width = width;
    canvas.height = height;
    this.render();
  }

  private _containerResizeCallback = (entries: ResizeObserverEntry[]): void => {
    // `contentRect` is better supported than `borderBoxSize` or `contentBoxSize`,
    // but it is left over from an earlier implementation of the Resize Observer API
    // and may be deprecated in future versions.
    const { width, height } = entries[0].contentRect ?? {};

    this._updateCanvasSize(width, height);
  };
}

export { ColorBar as default, ColorBar };
