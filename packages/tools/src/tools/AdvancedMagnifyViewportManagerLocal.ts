import { getEnabledElement, utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const singletonSymbol = Symbol('AdvancedMagnifyViewportManager');
const MAGNIFY_CLASSNAME = 'advancedMagnifyTool';

class AdvancedMagnifyViewportManager {
  private _viewports = new Map();

  constructor() {
    //
  }

  public static getInstance(): AdvancedMagnifyViewportManager {
    AdvancedMagnifyViewportManager[singletonSymbol] =
      AdvancedMagnifyViewportManager[singletonSymbol] ??
      new AdvancedMagnifyViewportManager();

    return AdvancedMagnifyViewportManager[singletonSymbol];
  }

  private _appendMagnifyViewportNode = (enabledElement, magnifyElement) => {
    const { canvas } = enabledElement.viewport;
    const parentNode = canvas.parentNode;
    const svgNode = parentNode.querySelector('.svg-layer');

    parentNode.insertBefore(magnifyElement, svgNode);
  };

  private _createViewportInstance = (enabledElement, radius): string => {
    const magnifyViewportId = csUtils.createGuid();
    const magnifyElement = document.createElement('div');
    const size = 2 * radius;

    magnifyElement.id = magnifyViewportId;
    magnifyElement.classList.add(MAGNIFY_CLASSNAME);

    Object.assign(magnifyElement.style, {
      display: 'block',
      width: `${size}px`,
      height: `${size}px`,
      position: 'absolute',
      overflow: 'hidden',
      borderRadius: '50%',
      border: `solid 5px #a00`,
      boxSizing: 'border-box',
      backgroundColor: 'rgba(255, 0, 0, 0.1)',
      left: `${-radius}px`,
      top: `${-radius}px`,
    });

    console.log('>>>>> enabledElement :: ', enabledElement);

    // DEBUG
    // document.body.appendChild(magnifyElement);
    this._appendMagnifyViewportNode(enabledElement, magnifyElement);

    // const magnifyEnabledElement = getEnabledElement(magnifyElement);

    this._viewports.set(magnifyViewportId, {
      enabledElement,
      // magnifyEnabledElement,
      magnifyElement,
    });

    return magnifyViewportId;
  };

  public createViewport = ({
    enabledElement,
    referencedImageId,
    position,
    radius,
  }): string => {
    const magnifyViewportId = this._createViewportInstance(
      enabledElement,
      radius
    );

    this.setViewportRadius(magnifyViewportId, radius);
    this.setViewportPosition(magnifyViewportId, position);

    return magnifyViewportId;
  };

  public destroyViewport(): void {
    //
  }

  // public getViewport(magnifyViewportId: string) {
  //   this._viewports.get(magnifyViewportId);
  // }

  public setViewportPosition(
    magnifyViewportId: string,
    centerPoint: Types.Point2
  ): void {
    const { magnifyElement } = this._viewports.get(magnifyViewportId);
    const [x, y] = centerPoint;

    magnifyElement.style.transform = `translate(${x}px, ${y}px)`;
  }

  public setViewportRadius(magnifyViewportId: string, radius: number): void {
    const { magnifyElement } = this._viewports.get(magnifyViewportId);
    const size = 2 * radius;

    Object.assign(magnifyElement.style, {
      width: `${size}px`,
      height: `${size}px`,
      left: `${-radius}px`,
      top: `${-radius}px`,
    });
  }

  public setVisibility(magnifyViewportId: string, visible: boolean) {
    const { magnifyElement } = this._viewports.get(magnifyViewportId);

    magnifyElement.style.display = visible ? 'block' : 'none';
  }
}

export {
  AdvancedMagnifyViewportManager as default,
  AdvancedMagnifyViewportManager,
};
