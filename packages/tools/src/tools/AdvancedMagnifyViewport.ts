import { utilities as csUtils } from '@cornerstonejs/core';

const MAGNIFY_CLASS = 'advancedMagnifyTool';

class AdvancedMagnifyViewport {
  private _viewportId: string;
  private _position: number[];
  private _radius: number;
  private _enabledElement: any;

  constructor({ enabledElement, referencedImageId, currentPoints }) {
    this._viewportId = csUtils.createGuid();
    this._enabledElement = this._createViewport(this._viewportId);
  }

  public get viewportId() {
    return this._viewportId;
  }

  public get position() {
    return [0, 0];
  }

  public set position(position) {
    this._position = position;
  }

  _createViewport(id) {
    const magnifyViewportId = csUtils.createGuid();
    const magnifyElement = document.createElement('div');

    magnifyElement.id = magnifyViewportId;
    magnifyElement.classList.add(MAGNIFY_CLASS);

    return magnifyElement;
  }

  _moveTo() {
    //
  }

  destroy() {
    //
  }
}

export { AdvancedMagnifyViewport as default, AdvancedMagnifyViewport };
