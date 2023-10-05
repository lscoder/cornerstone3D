import {
  getEnabledElement,
  eventTarget,
  Enums,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  SegmentationRepresentations,
  ToolModes,
  Events as cstEvents,
} from '../enums';
import { ToolGroupManager } from '../store';
import { debounce } from '../utilities';
import { ToolModeChangedEventType } from '../types/EventTypes';
import { segmentation } from '..';
import { IToolGroup } from '../types';
import { state } from '../store';
import {
  AnnotationTool,
  AdvancedMagnifyTool,
  SegmentationDisplayTool,
} from './';

const MAGNIFY_CLASSNAME = 'advancedMagnifyTool';
const MAGNIFY_VIEWPORT_INITIAL_RADIUS = 125;

const isSegmentation = (actor) => actor.uid !== actor.referenceId;
class AdvancedMagnifyViewport {
  private _viewportId: string;
  private _sourceEnabledElement: Types.IEnabledElement;
  private _enabledElement: Types.IEnabledElement = null;
  private _sourceToolGroup: IToolGroup = null;
  private _magnifyToolGroup: IToolGroup = null;
  private _isViewportReady = false;
  private _radius = 0;
  private _resized = false;
  private _resizeViewportAsync: () => void;

  public position: Types.Point2;
  public zoomFactor: number;
  public visible: boolean;

  constructor({
    sourceEnabledElement,
    radius = MAGNIFY_VIEWPORT_INITIAL_RADIUS,
    position = [0, 0],
    zoomFactor,
  }: {
    sourceEnabledElement: Types.IEnabledElement;
    radius?: number;
    position?: Types.Point2;
    zoomFactor: number;
  }) {
    // Private properties
    this._viewportId = `magnifyViewport-${csUtils.createGuid()}`;
    this._sourceEnabledElement = sourceEnabledElement;

    // Pulic properties
    this.radius = radius;
    this.position = position;
    this.zoomFactor = zoomFactor;
    this.visible = true;

    this._mouseDownCallback = this._mouseDownCallback.bind(this);
    this._mouseUpCallback = this._mouseUpCallback.bind(this);
    this._handleToolModeChanged = this._handleToolModeChanged.bind(this);
    this._resizeViewportAsync = <() => void>(
      debounce(this._resizeViewport.bind(this), 1)
    );

    this._initialize();
  }

  public get viewportId() {
    return this._viewportId;
  }

  public get radius() {
    return this._radius;
  }

  public set radius(radius: number) {
    // Just moving the magnifying glass around may change its radius
    // by very small amount due to floating number precision
    if (Math.abs(this._radius - radius) > 0.00001) {
      this._radius = radius;
      this._resized = true;
    }
  }

  private _handleToolModeChanged(evt: ToolModeChangedEventType) {
    const { _magnifyToolGroup: magnifyToolGroup } = this;
    const { toolGroupId, toolName, mode, toolBindingsOptions } = evt.detail;

    if (this._sourceToolGroup?.id !== toolGroupId) {
      return;
    }

    switch (mode) {
      case ToolModes.Active:
        magnifyToolGroup.setToolActive(toolName, toolBindingsOptions);
        break;
      case ToolModes.Passive:
        magnifyToolGroup.setToolPassive(toolName);
        break;
      case ToolModes.Enabled:
        magnifyToolGroup.setToolEnabled(toolName);
        break;
      case ToolModes.Disabled:
        magnifyToolGroup.setToolDisabled(toolName);
        break;
      default:
        throw new Error(`Unknow tool mode (${mode})`);
    }
  }

  private _appendMagnifyViewportNode(sourceEnabledElement, magnifyElement) {
    const { canvas } = sourceEnabledElement.viewport;
    const parentNode = canvas.parentNode;

    // const svgNode = parentNode.querySelector(':scope > .svg-layer');
    // parentNode.insertBefore(magnifyElement, svgNode);

    parentNode.appendChild(magnifyElement);
  }

  // Children elements need to inherit border-radius otherwise the canvas will
  // trigger events when moving/dragging/clicking on the corners outside of the
  // border (circle) region.
  private _inheritBorderRadius(magnifyElement) {
    const magnifyViewportElement: HTMLElement =
      magnifyElement.querySelector('.viewport-element');
    const magnifyCanvasElement: HTMLElement = magnifyElement.querySelector(
      '.cornerstone-canvas'
    );

    magnifyViewportElement.style.borderRadius = 'inherit';
    magnifyCanvasElement.style.borderRadius = 'inherit';
  }

  private _createViewportNode(): HTMLDivElement {
    const magnifyElement = document.createElement('div');
    const { radius } = this;
    const size = radius * 2;

    magnifyElement.classList.add(MAGNIFY_CLASSNAME);

    // Update the style and move the element out of the screen with "transforms"
    // to make it "invisible" and preserving its size because when "display" is
    // set to "none" both "offsetWidth" and "offsetHeight" returns zero. Another
    // way would be setting "visibility" to "hidden" but "transforms" is used
    // because it is already being updated when update() is called
    Object.assign(magnifyElement.style, {
      display: 'block',
      width: `${size}px`,
      height: `${size}px`,
      position: 'absolute',
      overflow: 'hidden',
      borderRadius: '50%',
      boxSizing: 'border-box',
      left: `${-radius}px`,
      top: `${-radius}px`,
      transform: `translate(-1000px, -1000px)`,
    });

    return magnifyElement;
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

  private _isStackViewport(
    viewport: Types.IViewport
  ): viewport is Types.IStackViewport {
    return 'setStack' in viewport;
  }

  private _isVolumeViewport(
    viewport: Types.IViewport
  ): viewport is Types.IVolumeViewport {
    return 'addVolumes' in viewport;
  }

  private _cloneToolGroups(
    sourceViewport: Types.IViewport,
    magnifyViewport: Types.IViewport
  ) {
    const sourceActors = sourceViewport.getActors();
    const magnifyToolGroupId = `${magnifyViewport.id}-toolGroup`;
    const sourceToolGroup = ToolGroupManager.getToolGroupForViewport(
      sourceViewport.id,
      sourceViewport.renderingEngineId
    );

    const magnifyToolGroup = sourceToolGroup.clone({
      newToolGroupId: magnifyToolGroupId,
      fnToolFilter: (toolName) => {
        const toolInstance = sourceToolGroup.getToolInstance(toolName);
        const isAnnotationTool =
          toolInstance instanceof AnnotationTool &&
          !(toolInstance instanceof AdvancedMagnifyTool);

        return (
          isAnnotationTool || toolName === SegmentationDisplayTool.toolName
        );
      },
    });

    magnifyToolGroup.addViewport(
      magnifyViewport.id,
      magnifyViewport.renderingEngineId
    );

    sourceActors.filter(isSegmentation).forEach((actor) => {
      segmentation.addSegmentationRepresentations(magnifyToolGroupId, [
        {
          segmentationId: actor.referenceId,
          type: SegmentationRepresentations.Labelmap,
        },
      ]);
    });

    return { sourceToolGroup, magnifyToolGroup };
  }

  private _cloneVolumeViewport({
    sourceViewport,
    magnifyViewportId,
    magnifyElement,
    renderingEngine,
  }: {
    sourceViewport: Types.IVolumeViewport;
    magnifyViewportId: string;
    magnifyElement: HTMLDivElement;
    renderingEngine: Types.IRenderingEngine;
  }): Types.IVolumeViewport {
    const actors = sourceViewport.getActors();
    const { options: sourceViewportOptions } = sourceViewport;

    const viewportInput = {
      element: magnifyElement,
      viewportId: magnifyViewportId,
      type: sourceViewport.type,
      defaultOptions: { ...sourceViewportOptions },
    };

    renderingEngine.enableElement(viewportInput);

    const magnifyViewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(magnifyViewportId)
    );

    // Actors with uid !== referenceId are segmentations
    const volumeInputArray: Types.IVolumeInput[] = actors
      .filter((actor) => !isSegmentation(actor))
      .map((actor) => ({ volumeId: actor.uid }));

    magnifyViewport.setVolumes(volumeInputArray).then(() => {
      this._isViewportReady = true;
      this.update();
    });

    return magnifyViewport;
  }

  private _cloneStackViewport({
    sourceViewport,
    magnifyViewportId,
    magnifyElement,
    renderingEngine,
  }: {
    sourceViewport: Types.IStackViewport;
    magnifyViewportId: string;
    magnifyElement: HTMLDivElement;
    renderingEngine: Types.IRenderingEngine;
  }): Types.IStackViewport {
    const imageIds = sourceViewport.getImageIds();
    const { options: sourceViewportOptions } = sourceViewport;
    const viewportInput = {
      element: magnifyElement,
      viewportId: magnifyViewportId,
      type: sourceViewport.type,
      defaultOptions: { ...sourceViewportOptions },
    };

    renderingEngine.enableElement(viewportInput);

    const magnifyViewport = renderingEngine.getViewport(
      magnifyViewportId
    ) as Types.IStackViewport;

    magnifyViewport.setStack(imageIds).then(() => {
      this._isViewportReady = true;
      this.update();
    });

    return magnifyViewport;
  }

  private _cloneViewport(sourceViewport, magnifyElement) {
    const { viewportId: magnifyViewportId } = this;
    const renderingEngine =
      sourceViewport.getRenderingEngine() as Types.IRenderingEngine;
    let magnifyViewport;

    if (this._isStackViewport(sourceViewport)) {
      magnifyViewport = this._cloneStackViewport({
        sourceViewport,
        magnifyViewportId,
        magnifyElement,
        renderingEngine,
      });
    } else if (this._isVolumeViewport(sourceViewport)) {
      magnifyViewport = this._cloneVolumeViewport({
        sourceViewport,
        magnifyViewportId,
        magnifyElement,
        renderingEngine,
      });
    }

    // Prevent handling events outside of the magnifying glass because it has rounded border
    this._inheritBorderRadius(magnifyElement);

    const toolGroups = this._cloneToolGroups(sourceViewport, magnifyViewport);

    this._sourceToolGroup = toolGroups.sourceToolGroup;
    this._magnifyToolGroup = toolGroups.magnifyToolGroup;
  }

  private _cancelMouseEventCallback(evt): void {
    evt.stopPropagation();
    evt.preventDefault();
  }

  private _mouseUpCallback(evt) {
    const { element } = this._enabledElement.viewport;

    // eslint-disable-next-line
    // console.log(`>>>>> MG :: event :: mouseUpCallback (${element.dataset.viewportUid})`);

    document.removeEventListener('mouseup', this._mouseUpCallback);

    // Restrict the scope of magnifying glass events again
    element.addEventListener('mouseup', this._cancelMouseEventCallback);
    element.addEventListener('mousemove', this._cancelMouseEventCallback);

    // evt.stopPropagation();
    // evt.preventDefault();
  }

  private _mouseDownCallback(evt) {
    const { element } = this._enabledElement.viewport;

    // eslint-disable-next-line
    // console.log(`>>>>> MG :: event :: mouseDownCallback (${element.dataset.viewportUid})`);

    // Wait for the mouseup event to restrict the scope of magnifying glass events again
    document.addEventListener('mouseup', this._mouseUpCallback);

    // Allow mouseup and mousemove events to make it possible to manipulate the
    // tool when passing the mouse over the magnifying glass (dragging a handle).
    // Just relying on state.isInteractingWithTool does not work because there
    // is a 400ms delay to handle double click (see mouseDownListener) which
    // makes the magnifying glass unresponsive for that amount of time.
    element.removeEventListener('mouseup', this._cancelMouseEventCallback);
    element.removeEventListener('mousemove', this._cancelMouseEventCallback);

    // evt.stopPropagation();
    // evt.preventDefault();
  }

  private _addNativeEventListeners(element) {
    // const { element } = this._enabledElement.viewport;

    // eslint-disable-next-line
    // console.log(`>>>>> MG :: addNativeEventListeners (${element.dataset.viewportUid})`);

    // mousedown on document is handled in the capture phase because the other
    // mousedown event listener added to the magnifying glass element does not
    // allow the event to buble up and reach the document.
    document.addEventListener('mousedown', this._mouseDownCallback, true);

    // All mouse events should not buble up avoiding the source viewport from
    // handling those events resulting in unexpected behaviors.
    element.addEventListener('mousedown', this._cancelMouseEventCallback);
    element.addEventListener('mouseup', this._cancelMouseEventCallback);
    element.addEventListener('mousemove', this._cancelMouseEventCallback);
    element.addEventListener('dblclick', this._cancelMouseEventCallback);
  }

  private _removeNativeEventListeners() {
    const { element } = this._enabledElement.viewport;

    // eslint-disable-next-line
    // console.log(`>>>>> MG :: removeNativeEventListeners (${element.dataset.viewportUid})`);

    document.removeEventListener('mousedown', this._mouseDownCallback, true);
    document.removeEventListener('mouseup', this._mouseUpCallback);
    element.removeEventListener('mousedown', this._cancelMouseEventCallback);
    element.removeEventListener('mouseup', this._cancelMouseEventCallback);
    element.removeEventListener('mousemove', this._cancelMouseEventCallback);
    element.removeEventListener('dblclick', this._cancelMouseEventCallback);
  }

  private _addEventListeners(magnifyElement) {
    // console.log('>>>>>  event :: MG :: adding listeners (magnifier)');

    eventTarget.addEventListener(
      cstEvents.TOOL_MODE_CHANGED,
      this._handleToolModeChanged
    );

    this._addNativeEventListeners(magnifyElement);
  }

  private _removeEventListeners() {
    eventTarget.removeEventListener(
      cstEvents.TOOL_MODE_CHANGED,
      this._handleToolModeChanged
    );

    this._removeNativeEventListeners();
  }

  private _initializeViewport(): void {
    const { _sourceEnabledElement: sourceEnabledElement } = this;
    const { viewport: sourceViewport } = sourceEnabledElement;
    const magnifyElement = this._createViewportNode();

    // this._cancelMouseEvent(magnifyElement, 'dblclick');
    // this._cancelMouseEvent(magnifyElement, 'mousedown');
    // this._cancelMouseEvent(magnifyElement, 'mouseup', false);
    // this._cancelMouseEvent(magnifyElement, 'mousemove', false);

    this._addEventListeners(magnifyElement);

    this._appendMagnifyViewportNode(sourceEnabledElement, magnifyElement);
    this._cloneViewport(sourceViewport, magnifyElement);
    this._enabledElement = getEnabledElement(magnifyElement);
  }

  private _initialize() {
    this._initializeViewport();
    // this._addEventListeners();
  }

  private _syncViewportsCameras(sourceViewport, magnifyViewport) {
    const worldPos = sourceViewport.canvasToWorld(this.position);

    // Use the original viewport for the base for parallelScale
    const parallelScale = this._convertZoomFactorToParalellScale(
      sourceViewport,
      magnifyViewport,
      this.zoomFactor
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

  private _syncStackViewports(
    sourceViewport: Types.IStackViewport,
    magnifyViewport: Types.IStackViewport
  ) {
    magnifyViewport.setImageIdIndex(sourceViewport.getCurrentImageIdIndex());
  }

  private _syncViewports() {
    const { viewport: sourceViewport } = this._sourceEnabledElement;
    const { viewport: magnifyViewport } = this._enabledElement;
    const sourceProperties = sourceViewport.getProperties();

    magnifyViewport.setProperties(sourceProperties);
    this._syncViewportsCameras(sourceViewport, magnifyViewport);

    if (this._isStackViewport(sourceViewport)) {
      this._syncStackViewports(
        sourceViewport as Types.IStackViewport,
        magnifyViewport as Types.IStackViewport
      );
    }
  }

  private _resizeViewport() {
    const { viewport } = this._enabledElement;
    const renderingEngine = viewport.getRenderingEngine();

    renderingEngine.resize();
  }

  public update() {
    const { radius, position, visible } = this;
    const { viewport } = this._enabledElement;
    const { element } = viewport;
    const size = 2 * radius;
    const [x, y] = position;

    if (this._resized) {
      this._resizeViewportAsync();
      this._resized = false;
    }

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
    this._removeEventListeners();
  }
}

export { AdvancedMagnifyViewport as default, AdvancedMagnifyViewport };
