import {
  getEnabledElement,
  Enums,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

const MAGNIFY_CLASSNAME = 'advancedMagnifyTool';
const MAGNIFY_VIEWPORT_INITIAL_RADIUS = 125;

class AdvancedMagnifyViewport {
  private _viewportId: string;
  private _parentEnabledElement: Types.IEnabledElement;
  private _enabledElement: Types.IEnabledElement;
  private _referencedImageId: string;
  private _radius: number;
  private _position: Types.Point2;
  private _zoomFactor: number;
  private _visible: boolean;
  private _isViewportReady: boolean;
  private _invalidated: boolean;

  constructor({
    parentEnabledElement,
    referencedImageId,
    radius = MAGNIFY_VIEWPORT_INITIAL_RADIUS,
    position = [0, 0],
  }: {
    parentEnabledElement: Types.IEnabledElement;
    referencedImageId: string;
    radius?: number;
    position?: Types.Point2;
  }) {
    this._viewportId = csUtils.createGuid();
    this._referencedImageId = referencedImageId;
    this._parentEnabledElement = parentEnabledElement;
    this._enabledElement = null;
    this._radius = radius;
    this._position = position;
    this._zoomFactor = 2.5;
    this._visible = true;
    this._isViewportReady = false;
    this._invalidated = true;

    this._initializeViewport();
  }

  public get viewportId() {
    return this._viewportId;
  }

  public get position(): Types.Point2 {
    return this._position;
  }

  public set position(position: Types.Point2) {
    const shouldUpdate =
      this._position[0] !== position[0] || this._position[1] !== position[1];

    if (shouldUpdate) {
      this._position = position;
      this._invalidated = true;
    }
  }

  public get radius(): number {
    return this._radius;
  }

  public set radius(radius: number) {
    if (this._radius !== radius) {
      this._radius = radius;
      this._invalidated = true;
    }
  }

  public get visible(): boolean {
    return this._visible;
  }

  public set visible(visible: boolean) {
    this._visible = visible;
    this._invalidated = true;
  }

  private _appendMagnifyViewportNode = (
    parentEnabledElement,
    magnifyElement
  ) => {
    const { canvas } = parentEnabledElement.viewport;
    const parentNode = canvas.parentNode;
    const svgNode = parentNode.querySelector(':scope > .svg-layer');

    parentNode.insertBefore(magnifyElement, svgNode);
  };

  // Children elements need to inherit border-radius otherwise the canvas will
  // trigger events when moving/dragging/clicking on the corners outside of the
  // border (circle) region.
  private _inheritBorderRadius = (magnifyElement) => {
    const magnifyViewportElement: HTMLElement =
      magnifyElement.querySelector('.viewport-element');
    const magnifyCanvasElement: HTMLElement = magnifyElement.querySelector(
      '.cornerstone-canvas'
    );

    magnifyViewportElement.style.borderRadius = 'inherit';
    magnifyCanvasElement.style.borderRadius = 'inherit';
  };

  private _createViewportNode(): HTMLDivElement {
    const magnifyElement = document.createElement('div');
    const { radius } = this;
    const size = radius * 2;

    magnifyElement.classList.add(MAGNIFY_CLASSNAME);

    Object.assign(magnifyElement.style, {
      display: 'block',
      width: `${size}px`,
      height: `${size}px`,
      position: 'absolute',
      overflow: 'hidden',
      borderRadius: '50%',
      // border: `solid 5px #a00`,
      boxSizing: 'border-box',
      // backgroundColor: 'rgba(255, 0, 0, 0.1)',
      left: `${-radius}px`,
      top: `${-radius}px`,
    });

    return magnifyElement;
  }

  // TODO: Implement cloneVolumeViewport
  private _cloneVolumeViewport({
    viewport,
    viewportId,
    magnifyElement,
    renderingEngine,
  }: {
    viewport: Types.IVolumeViewport;
    viewportId: string;
    magnifyElement: HTMLDivElement;
    renderingEngine: Types.IRenderingEngine;
  }): Types.IVolumeViewport {
    return null;
  }

  private _convertZoomFactorToParalellScale(
    viewport,
    magnifyViewport,
    zoomFactor
  ) {
    const { parallelScale } = viewport.getCamera();
    const canvasRatio =
      magnifyViewport.canvas.offsetWidth / viewport.canvas.offsetWidth;

    return parallelScale * (1 / zoomFactor) * canvasRatio;
  }

  private _cloneStackViewport({
    parentViewport,
    magnifyViewportId,
    magnifyElement,
    renderingEngine,
    referencedImageId,
  }: {
    parentViewport: Types.IVolumeViewport;
    magnifyViewportId: string;
    magnifyElement: HTMLDivElement;
    renderingEngine: Types.IRenderingEngine;
    referencedImageId: string;
  }): Types.IStackViewport {
    const viewportInput = {
      viewportId: magnifyViewportId,
      type: Enums.ViewportType.STACK,
      element: magnifyElement as HTMLDivElement,
    };

    renderingEngine.enableElement(viewportInput);

    const magnifyViewport = renderingEngine.getViewport(
      magnifyViewportId
    ) as Types.IStackViewport;

    magnifyViewport.setStack([referencedImageId]).then(() => {
      this._isViewportReady = true;
      this.update();
    });

    return magnifyViewport;
  }

  private _cloneViewport(parentViewport, magnifyElement, referencedImageId) {
    const { viewportId: magnifyViewportId } = this;
    const renderingEngine =
      parentViewport.getRenderingEngine() as Types.IRenderingEngine;

    this._cloneStackViewport({
      parentViewport,
      magnifyViewportId,
      magnifyElement,
      renderingEngine,
      referencedImageId,
    });

    this._inheritBorderRadius(magnifyElement);
  }

  private _initializeViewport(): void {
    const {
      _parentEnabledElement: parentEnabledElement,
      _referencedImageId: referencedImageId,
    } = this;
    const { viewport: parentViewport } = parentEnabledElement;
    const magnifyElement = this._createViewportNode();

    this._appendMagnifyViewportNode(parentEnabledElement, magnifyElement);
    this._cloneViewport(parentViewport, magnifyElement, referencedImageId);
    this._enabledElement = getEnabledElement(magnifyElement);
  }

  private _syncViewportsCameras(parentViewport, magnifyViewport) {
    // DEBUG (REMOVE)
    (window as any).parentViewport = parentViewport;
    (window as any).magnifyViewport = magnifyViewport;

    const worldPos = parentViewport.canvasToWorld(this.position);

    // Use the original viewport for the base for parallelScale
    const parallelScale = this._convertZoomFactorToParalellScale(
      parentViewport,
      magnifyViewport,
      this._zoomFactor
    );

    const { focalPoint, position, viewPlaneNormal } =
      magnifyViewport.getCamera();

    const distance = Math.sqrt(
      Math.pow(focalPoint[0] - position[0], 2) +
        Math.pow(focalPoint[1] - position[1], 2) +
        Math.pow(focalPoint[2] - position[2], 2)
    );

    const updatedFocalPoint = <Types.Point3>[
      worldPos[0],
      worldPos[1],
      worldPos[2],
    ];

    const updatedPosition = <Types.Point3>[
      updatedFocalPoint[0] + distance * viewPlaneNormal[0],
      updatedFocalPoint[1] + distance * viewPlaneNormal[1],
      updatedFocalPoint[2] + distance * viewPlaneNormal[2],
    ];

    magnifyViewport.setCamera({
      parallelScale,
      focalPoint: updatedFocalPoint,
      position: updatedPosition,
    });
  }

  private _syncViewports() {
    const { viewport: parentViewport } = this._parentEnabledElement;
    const { viewport } = this._enabledElement;
    const parentProperties = parentViewport.getProperties();

    viewport.setProperties(parentProperties);
    this._syncViewportsCameras(parentViewport, viewport);
  }

  public update() {
    const { radius, position, visible } = this;
    const { viewport } = this._enabledElement;
    const { element } = viewport;
    const size = 2 * radius;
    const [x, y] = position;

    Object.assign(element.style, {
      display: visible ? 'block' : 'hidden',
      width: `${size}px`,
      height: `${size}px`,
      left: `${-radius}px`,
      top: `${-radius}px`,
      transform: `translate(${x}px, ${y}px)`,
    });

    if (this._isViewportReady) {
      this._syncViewports();
      viewport.render();
    }
  }

  public destroy() {
    console.log('>>>>> destroy');
  }
}

export { AdvancedMagnifyViewport as default, AdvancedMagnifyViewport };
