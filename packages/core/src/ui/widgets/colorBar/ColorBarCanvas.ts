import { utilities } from '@cornerstonejs/core';
import { ColorBarOrientation } from './enums';
import { ColorBarRange, ColorBarVOIRange, Colormap } from './types';
import { ColorBarCanvasProps } from './types/ColormapCanvasProps';
import { ColorBarSize } from './types/ColorBarSize';

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

class ColorBarCanvas {
  private _canvas: HTMLCanvasElement;
  private _range: ColorBarRange;
  private _voiRange: ColorBarVOIRange;
  private _orientation: ColorBarOrientation;
  private _colormap: Colormap;

  constructor(props: ColorBarCanvasProps) {
    const {
      colormap,
      size = { width: 100, height: 20 },
      range = { lower: 0, upper: 1 },
      voiRange = { lower: 0, upper: 1 },
      orientation = ColorBarOrientation.Auto,
      container,
    } = props;

    this._colormap = colormap;
    this._range = range;
    this._voiRange = voiRange;
    this._orientation = orientation;

    this._canvas = this._createRootElement(size);

    if (container) {
      this.appendTo(container);
    }
  }

  public get colormap() {
    return this._colormap;
  }

  public set colormap(colormap: Colormap) {
    this._colormap = colormap;
    this.render();
  }

  public get size(): ColorBarSize {
    const { width, height } = this._canvas;
    return { width, height };
  }

  public set size(size: ColorBarSize) {
    const { _canvas: canvas } = this;

    if (size.width === canvas.width && size.height === canvas.height) {
      return;
    }

    canvas.width = size.width;
    canvas.height = size.height;

    Object.assign(canvas.style, {
      width: `${size.width}px`,
      height: `${size.height}px`,
    });

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

    if (voiRange.lower === currentLower && voiRange.upper === currentUpper) {
      return;
    }

    this._voiRange = getValidRange(voiRange);
    this.render();
  }

  public appendTo(container: HTMLElement) {
    container.appendChild(this._canvas);
    this.render();
  }

  /**
   * Render the color bar using the active LUT
   */
  public render(): void {
    const { _colormap: colormap } = this;
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

    for (let i = 0; i < maxValue; i++) {
      const tVoiRange = (rawPixelValue - voiRange.lower) / windowWidth;

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
  }

  private _createRootElement(size: ColorBarSize) {
    const canvas = document.createElement('canvas');

    canvas.width = size.width;
    canvas.height = size.height;

    Object.assign(canvas.style, {
      width: `${size.width}px`,
      height: `${size.height}px`,
      pointerEvents: 'none',
      boxSizing: 'border-box',

      // DEBUG
      position: 'absolute',
      top: '0px',
      left: '25px',
      // border: 'solid 1px #f00',
    });

    return canvas;
  }

  public dispose() {
    const { _canvas: canvas } = this;
    const { parentElement } = canvas;

    parentElement?.removeChild(canvas);
  }
}

export { ColorBarCanvas as default, ColorBarCanvas };
