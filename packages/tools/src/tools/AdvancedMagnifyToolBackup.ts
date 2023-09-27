import { BaseTool } from './base';
import { Events } from '../enums';

import { getEnabledElement, StackViewport } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { EventTypes, PublicToolProps, ToolProps } from '../types';
import { getViewportIdsWithToolToRender } from '../utilities/viewportFilters';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import { MouseBindings } from '../enums';
import { state } from '../store';
import { Enums } from '@cornerstonejs/core';

import {
  hideElementCursor,
  resetElementCursor,
} from '../cursors/elementCursor';
import { IPoints } from '../types';

const MAGNIFY_VIEWPORT_ID = 'advanced-magnify-viewport';

class AdvancedMagnifyTool extends BaseTool {
  static toolName;
  _bounds: any;
  editData: {
    referencedImageId: string;
    viewportIdsToRender: string[];
    enabledElement: Types.IEnabledElement;
    magnifyEnabledElement: Types.IEnabledElement;
    renderingEngine: Types.IRenderingEngine;
    currentPoints: IPoints;
  } | null;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        magnifyZoomFactor: 2.5,
        magnifyRadius: 125, //px
        borderSize: 2, //px
        resizeBorderHandleSize: 10,
        borderColor: '#aaa',
        activeBorderColor: '#0fa',
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  _getReferencedImageId(
    viewport: Types.IStackViewport | Types.IVolumeViewport
  ): string {
    const targetId = this.getTargetId(viewport);

    let referencedImageId;

    if (viewport instanceof StackViewport) {
      referencedImageId = targetId.split('imageId:')[1];
    }

    return referencedImageId;
  }

  preMouseDownCallback = (evt: EventTypes.InteractionEventType) => {
    console.log('>>>>> preMouseDownCallback');

    const eventDetail = evt.detail;
    const { element, currentPoints } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    if (!(viewport instanceof StackViewport)) {
      throw new Error('AdvancedMagnifyTool only works on StackViewports');
    }

    // Does not do anything if magnifying glass has already been added to the viewport
    if (element.querySelector('.magnifyTool')) {
      return;
    }

    const referencedImageId = this._getReferencedImageId(viewport);

    if (!referencedImageId) {
      throw new Error(
        'AdvancedMagnifyTool: No referenced image id found, reconstructed planes not supported yet'
      );
    }

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      referencedImageId,
      viewportIdsToRender,
      enabledElement,
      renderingEngine,
      currentPoints,
      magnifyEnabledElement: null,
    };

    this.editData.magnifyEnabledElement = this._createMagnifyViewport(
      this.editData
    );

    // this._activateMagnifyEvents(magnifyElement);
    this._activateDrawEvents(element);

    // hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return true;
  };

  preTouchStartCallback = (evt: EventTypes.InteractionEventType) => {
    this.preMouseDownCallback(evt);
  };

  // Children elements need to inherit border-radius otherwise the canvas will
  // trigger events when moving/dragging/clicking on the corners outside of the
  // border (circle) region.
  _inheritBorderRadius = (magnifyElement) => {
    const magnifyViewportElement: HTMLElement =
      magnifyElement.querySelector('.viewport-element');
    const magnifyCanvasElement: HTMLElement = magnifyElement.querySelector(
      '.cornerstone-canvas'
    );

    magnifyViewportElement.style.borderRadius = 'inherit';
    magnifyCanvasElement.style.borderRadius = 'inherit';
  };

  _convertZoomFactorToParalellScale = (
    viewport,
    magnifyViewport,
    zoomFactor
  ) => {
    const { parallelScale } = viewport.getCamera();
    const canvasRatio =
      magnifyViewport.canvas.offsetWidth / viewport.canvas.offsetWidth;

    return parallelScale * (1 / zoomFactor) * canvasRatio;
  };

  _getZoomFactor = () => {
    const { enabledElement, magnifyEnabledElement } = this.editData;
    const { viewport } = enabledElement;
    const { viewport: magnifyViewport } = magnifyEnabledElement;
    const canvasRatio =
      magnifyViewport.canvas.offsetWidth / viewport.canvas.offsetWidth;

    return (
      (viewport.getCamera().parallelScale /
        magnifyViewport.getCamera().parallelScale) *
      canvasRatio
    );
  };

  _setZoomFactor = (zoomFactor) => {
    const { enabledElement, magnifyEnabledElement } = this.editData;
    const { viewport } = enabledElement;
    const { viewport: magnifyViewport } = magnifyEnabledElement;
    const parallelScale = this._convertZoomFactorToParalellScale(
      viewport,
      magnifyViewport,
      zoomFactor
    );

    magnifyViewport.setCamera({
      ...magnifyViewport.getCamera(),
      parallelScale,
    });
  };

  _syncViewportsCameras = (viewport, magnifyViewport, worldPos) => {
    // DEBUG (REMOVE)
    (window as any).viewport = viewport;
    (window as any).magnifyViewport = magnifyViewport;

    // Use the original viewport for the base for parallelScale
    const parallelScale = this._convertZoomFactorToParalellScale(
      viewport,
      magnifyViewport,
      this.configuration.magnifyZoomFactor
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
  };

  _updateMagnifyViewportCamera = ({ element, currentPoints }) => {
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;
    const magnifyViewport = renderingEngine.getViewport(MAGNIFY_VIEWPORT_ID);

    this._syncViewportsCameras(viewport, magnifyViewport, currentPoints.world);
    magnifyViewport.render();
  };

  _createMagnifyViewport = ({
    enabledElement,
    referencedImageId,
    viewportIdsToRender,
    renderingEngine,
    currentPoints,
  }) => {
    // const {
    //   enabledElement,
    //   referencedImageId,
    //   viewportIdsToRender,
    //   renderingEngine,
    //   currentPoints,
    // } = this.editData;
    const { viewport } = enabledElement;
    const { element } = viewport;
    const { voiRange } = viewport.getProperties();
    const { canvas: canvasPos, world: worldPos } = currentPoints;

    let magnifyElement: HTMLDivElement = element.querySelector('.magnifyTool');

    if (magnifyElement === null) {
      const { magnifyRadius, borderSize, borderColor } = this.configuration;
      const elementSize = magnifyRadius * 2;

      magnifyElement = document.createElement('div');
      magnifyElement.classList.add('magnifyTool');

      Object.assign(magnifyElement.style, {
        display: 'block',
        width: `${elementSize}px`,
        height: `${elementSize}px`,
        position: 'absolute',
        overflow: 'hidden',
        borderRadius: '50%',
        border: `solid ${borderSize}px ${borderColor}`,
        boxSizing: 'border-box',
      });

      const viewportElement = element.querySelector('.viewport-element');
      viewportElement.appendChild(magnifyElement);

      const viewportInput = {
        viewportId: MAGNIFY_VIEWPORT_ID,
        type: Enums.ViewportType.STACK,
        element: magnifyElement as HTMLDivElement,
      };

      renderingEngine.enableElement(viewportInput);
      this._inheritBorderRadius(magnifyElement);
    }

    // Todo: use CSS transform instead of setting top and left for better performance
    magnifyElement.style.top = `${
      canvasPos[1] - this.configuration.magnifyRadius
    }px`;
    magnifyElement.style.left = `${
      canvasPos[0] - this.configuration.magnifyRadius
    }px`;

    const magnifyViewport = renderingEngine.getViewport(
      MAGNIFY_VIEWPORT_ID
    ) as Types.IStackViewport;

    magnifyViewport.setStack([referencedImageId]).then(() => {
      // match the original viewport voi range
      magnifyViewport.setProperties({ voiRange });
      this._syncViewportsCameras(viewport, magnifyViewport, worldPos);
      magnifyViewport.render();
    });

    // magnifyElement.style.display = 'block';
    // triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return getEnabledElement(magnifyElement);
  };

  _getBorderDistance = (canvasPos) => {
    const { magnifyRadius } = this.configuration;
    const delta = [magnifyRadius - canvasPos[0], magnifyRadius - canvasPos[1]];
    const dist = Math.sqrt(delta[0] ** 2 + delta[1] ** 2);

    return magnifyRadius - dist;
  };

  _isBorderHandlePoint = (canvasPos) => {
    const borderDist = this._getBorderDistance(canvasPos);
    const expectedBorderDist = Math.max(
      this.configuration.resizeBorderHandleSize,
      this.configuration.borderSize
    );

    return borderDist < expectedBorderDist;
  };

  _mouseDragCallback = (evt: EventTypes.InteractionEventType) => {
    console.log('>>>>> mouseDragCallback');
    const { element, currentPoints } = evt.detail;
    const { canvas: canvasPos } = currentPoints;
    const magnifyElement = element.querySelector(
      '.magnifyTool'
    ) as HTMLDivElement;

    magnifyElement.style.top = `${
      canvasPos[1] - this.configuration.magnifyRadius
    }px`;
    magnifyElement.style.left = `${
      canvasPos[0] - this.configuration.magnifyRadius
    }px`;

    this._updateMagnifyViewportCamera(evt.detail);
  };

  _mouseDragEndCallback = (evt: EventTypes.InteractionEventType) => {
    const { element } = evt.detail;
    // const enabledElement = getEnabledElement(element);
    // const { renderingEngine } = enabledElement;

    // renderingEngine.disableElement(MAGNIFY_VIEWPORT_ID);

    const viewportElement = element.querySelector('.viewport-element');

    const magnifyElement = viewportElement.querySelector(
      '.magnifyTool'
    ) as HTMLDivElement;

    this._activateMagnifyEvents(magnifyElement);
    // viewportElement.removeChild(magnifyElement);

    this._deactivateDrawEvents(element);
    resetElementCursor(element);
  };

  _mouseMoveCallback = (evt: EventTypes.InteractionEventType) => {
    this._updateMagnifyViewportCamera(evt.detail);
  };

  _magnifyMoveCallback = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;
    const { element, startPoints, currentPoints } = eventDetail;
    const { page: pageStartPoints } = startPoints;
    const { page: pagePos } = currentPoints;
    const deltaPointsPage = [
      pagePos[0] - pageStartPoints[0],
      pagePos[1] - pageStartPoints[1],
    ];

    const newLeft = parseInt(element.dataset.initialLeft) + deltaPointsPage[0];
    const newTop = parseInt(element.dataset.initialTop) + deltaPointsPage[1];

    element.style.left = `${newLeft}px`;
    element.style.top = `${newTop}px`;
  };

  _magnifyMoveStartCallback = (evt: EventTypes.InteractionEventType) => {
    const { element: magnifyElement } = evt.detail;

    magnifyElement.dataset.initialTop = magnifyElement.offsetTop.toString();
    magnifyElement.dataset.initialLeft = magnifyElement.offsetLeft.toString();

    magnifyElement.addEventListener(
      Events.MOUSE_DRAG,
      this._magnifyMoveCallback as EventListener
    );
  };

  _magnifyResizeCallback = (evt: EventTypes.InteractionEventType) => {
    const { element: magnifyElement } = evt.detail;
    const { currentPoints } = evt.detail;
    const { page: pageCurrentPoints } = currentPoints;
    const initialState = magnifyElement.dataset;
    const resizePageCenterX = parseInt(initialState.resizePageCenterX);
    const resizePageCenterY = parseInt(initialState.resizePageCenterY);
    const initialCursorDist = parseInt(initialState.initialCursorDist);
    const resizeInitialRadius = parseInt(initialState.resizeInitialRadius);
    const cursorDeltaX = pageCurrentPoints[0] - resizePageCenterX;
    const cursorDeltaY = pageCurrentPoints[1] - resizePageCenterY;
    const currentCursorDist = Math.sqrt(cursorDeltaX ** 2 + cursorDeltaY ** 2);
    const deltaCursorDist = currentCursorDist - initialCursorDist;
    const newMagnifyRadius = resizeInitialRadius + deltaCursorDist;
    const newMagnifySize = newMagnifyRadius * 2;
    const parentRect = magnifyElement.offsetParent.getBoundingClientRect();
    const parentCenterX = resizePageCenterX - parentRect.left;
    const parentCenterY = resizePageCenterY - parentRect.top;

    magnifyElement.style.width = `${newMagnifySize}px`;
    magnifyElement.style.height = `${newMagnifySize}px`;
    magnifyElement.style.left = `${parentCenterX - newMagnifyRadius}px`;
    magnifyElement.style.top = `${parentCenterY - newMagnifyRadius}px`;

    this.configuration.magnifyRadius = newMagnifyRadius;

    evt.preventDefault();
  };

  _magnifyResizeStartCallback = (evt: EventTypes.InteractionEventType) => {
    const { magnifyRadius } = this.configuration;
    const { element: magnifyElement, currentPoints } = evt.detail;
    const { page: pageCurrentPoints } = currentPoints;
    const rect = magnifyElement.getBoundingClientRect();
    const radius = Math.round(rect.width * 0.5);
    const pageCenterPosX = Math.round(rect.left + magnifyRadius);
    const pageCenterPosY = Math.round(rect.top + magnifyRadius);
    const cursorDeltaX = pageCurrentPoints[0] - pageCenterPosX;
    const cursorDeltaY = pageCurrentPoints[1] - pageCenterPosY;
    const cursorDist = Math.sqrt(cursorDeltaX ** 2 + cursorDeltaY ** 2);

    magnifyElement.dataset.resizePageCenterX = pageCenterPosX.toString();
    magnifyElement.dataset.resizePageCenterY = pageCenterPosY.toString();
    magnifyElement.dataset.resizeInitialRadius = radius.toString();
    magnifyElement.dataset.initialCursorDist = cursorDist.toString();

    magnifyElement.addEventListener(
      Events.MOUSE_DRAG,
      this._magnifyResizeCallback as EventListener
    );
  };

  _magnifyZoomCallback = (evt: EventTypes.InteractionEventType) => {
    console.log('>>>>> evt.detail ::', evt.detail);
    const { element: magnifyElement, currentPoints } = evt.detail;
    const { viewport: magnifyViewport } = getEnabledElement(magnifyElement);
    const { page: pageCurrentPoints } = currentPoints;
    // const initialState = magnifyElement.dataset;
    const currentZoomFactor = this._getZoomFactor();
    const newZoomFactor = currentZoomFactor + 0.1;

    // const resizePageCenterX = parseInt(initialState.resizePageCenterX);
    // const resizePageCenterY = parseInt(initialState.resizePageCenterY);
    // const initialCursorDist = parseInt(initialState.initialCursorDist);
    // const resizeInitialRadius = parseInt(initialState.resizeInitialRadius);
    // const cursorDeltaX = pageCurrentPoints[0] - resizePageCenterX;
    // const cursorDeltaY = pageCurrentPoints[1] - resizePageCenterY;
    // const currentCursorDist = Math.sqrt(cursorDeltaX ** 2 + cursorDeltaY ** 2);
    // const deltaCursorDist = currentCursorDist - initialCursorDist;
    // const newMagnifyRadius = resizeInitialRadius + deltaCursorDist;

    console.log('>>>>> currentZoomFactor', currentZoomFactor);

    this.configuration.magnifyZoomFactor = newZoomFactor;
    this._setZoomFactor(newZoomFactor);
    magnifyViewport.render();
  };

  _magnifyZoomStartCallback = (evt: EventTypes.InteractionEventType) => {
    const { magnifyRadius } = this.configuration;
    const { element: magnifyElement, currentPoints } = evt.detail;
    const { page: pageCurrentPoints } = currentPoints;
    const initialZoomFactor = this._getZoomFactor();
    const rect = magnifyElement.getBoundingClientRect();
    const pageCenterPosX = Math.round(rect.left + magnifyRadius);
    const pageCenterPosY = Math.round(rect.top + magnifyRadius);

    const cursorDeltaX = pageCurrentPoints[0] - pageCenterPosX;
    const cursorDeltaY = pageCurrentPoints[1] - pageCenterPosY;
    const cursorDist = Math.sqrt(cursorDeltaX ** 2 + cursorDeltaY ** 2);

    magnifyElement.dataset.initialZoomFactor = initialZoomFactor.toString();
    // magnifyElement.dataset.zoomInitialRadius = magnifyRadius.toString();
    // magnifyElement.dataset.zoomPageCenterX = pageCenterPosX.toString();
    // magnifyElement.dataset.zoomPageCenterY = pageCenterPosY.toString();

    magnifyElement.addEventListener(
      Events.MOUSE_DRAG,
      this._magnifyZoomCallback as EventListener
    );
  };

  _magnifyMouseDownCallback = (evt: EventTypes.InteractionEventType) => {
    const { currentPoints, mouseButton } = evt.detail;
    const { canvas: canvasPos } = currentPoints;
    const borderHandleActive = this._isBorderHandlePoint(canvasPos);

    if (borderHandleActive) {
      if (mouseButton === MouseBindings.Primary) {
        this._magnifyResizeStartCallback(evt);
      } else if (mouseButton === MouseBindings.Secondary) {
        this._magnifyZoomStartCallback(evt);
      }
    } else {
      this._magnifyMoveStartCallback(evt);
    }
  };

  _magnifyMouseUpCallback = (evt: EventTypes.InteractionEventType) => {
    const { element: magnifyElement } = evt.detail;
    this._deactivateInteractionEvents(magnifyElement);
  };

  _magnifyMouseMoveCallback = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;
    const { element, currentPoints } = eventDetail;
    const { canvas: canvasPos } = currentPoints;
    const { borderColor, activeBorderColor } = this.configuration;
    const borderHandleActive = this._isBorderHandlePoint(canvasPos);

    if (borderHandleActive) {
      element.style.borderColor = activeBorderColor;
    } else {
      element.style.borderColor = borderColor;
    }

    evt.preventDefault();
  };

  _magnifyMouseOutCallback = (evt) => {
    const { target: magnifyElement } = evt;
    const { borderColor } = this.configuration;

    magnifyElement.style.borderColor = borderColor;
  };

  _activateMagnifyEvents = (magnifyElement) => {
    magnifyElement.addEventListener(
      Events.MOUSE_DOWN_ACTIVATE,
      this._magnifyMouseDownCallback
    );

    magnifyElement.addEventListener(
      Events.MOUSE_UP,
      this._magnifyMouseUpCallback as EventListener
    );

    magnifyElement.addEventListener(
      Events.MOUSE_MOVE,
      this._magnifyMouseMoveCallback as EventListener
    );

    // Native mouseout event
    magnifyElement.addEventListener('mouseout', this._magnifyMouseOutCallback);
  };

  _deactivateMagnifyEvents = (magnifyElement) => {
    magnifyElement.removeEventListener(
      Events.MOUSE_DOWN_ACTIVATE,
      this._magnifyMouseDownCallback
    );

    magnifyElement.removeEventListener(
      Events.MOUSE_UP,
      this._magnifyMouseUpCallback as EventListener
    );

    magnifyElement.removeEventListener(
      Events.MOUSE_MOVE,
      this._magnifyMouseMoveCallback as EventListener
    );

    // Native mouseout event
    magnifyElement.removeEventListener(
      'mouseout',
      this._magnifyMouseOutCallback
    );
  };

  _deactivateInteractionEvents = (magnifyElement: HTMLDivElement) => {
    magnifyElement.removeEventListener(
      Events.MOUSE_DRAG,
      this._magnifyResizeCallback as EventListener
    );

    magnifyElement.removeEventListener(
      Events.MOUSE_DRAG,
      this._magnifyZoomCallback as EventListener
    );

    magnifyElement.removeEventListener(
      Events.MOUSE_DRAG,
      this._magnifyMoveCallback as EventListener
    );
  };

  _activateDrawEvents = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(
      Events.MOUSE_UP,
      this._mouseDragEndCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._mouseDragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_MOVE,
      this._mouseMoveCallback as EventListener
    );
    // element.addEventListener(
    //   Events.MOUSE_CLICK,
    //   this._mouseDragEndCallback as EventListener
    // );

    element.addEventListener(
      Events.TOUCH_END,
      this._mouseDragEndCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_DRAG,
      this._mouseDragCallback as EventListener
    );
  };

  _deactivateDrawEvents = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(
      Events.MOUSE_UP,
      this._mouseDragEndCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._mouseDragCallback as EventListener
    );
    // element.removeEventListener(
    //   Events.MOUSE_CLICK,
    //   this._mouseDragEndCallback as EventListener
    // );
    element.removeEventListener(
      Events.TOUCH_END,
      this._mouseDragEndCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_DRAG,
      this._mouseDragCallback as EventListener
    );
  };
}

AdvancedMagnifyTool.toolName = 'AdvancedMagnify';
export default AdvancedMagnifyTool;
