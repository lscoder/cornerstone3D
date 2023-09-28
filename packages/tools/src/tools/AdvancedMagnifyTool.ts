/* eslint-disable */
import { AnnotationTool } from './base';

import {
  getEnabledElement,
  VolumeViewport,
  eventTarget,
  triggerEvent,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import roundNumber from '../utilities/roundNumber';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../stateManagement/annotation/annotationState';
import { isAnnotationLocked } from '../stateManagement/annotation/annotationLocking';
import { isAnnotationVisible } from '../stateManagement/annotation/annotationVisibility';
import {
  drawCircle as drawCircleSvg,
  drawHandles as drawHandlesSvg,
} from '../drawingSvg';
import { state } from '../store';
import { Events } from '../enums';
import { getViewportIdsWithToolToRender } from '../utilities/viewportFilters';
import getWorldWidthAndHeightFromTwoPoints from '../utilities/planar/getWorldWidthAndHeightFromTwoPoints';
import {
  resetElementCursor,
  hideElementCursor,
} from '../cursors/elementCursor';
import {
  EventTypes,
  ToolHandle,
  PublicToolProps,
  ToolProps,
  InteractionTypes,
  SVGDrawingHelper,
} from '../types';
import { AdvancedMagnifyAnnotation } from '../types/ToolSpecificAnnotationTypes';

import {
  AnnotationCompletedEventDetail,
  AnnotationModifiedEventDetail,
  MouseDragEventType,
  MouseMoveEventType,
} from '../types/EventTypes';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import { StyleSpecifier } from '../types/AnnotationStyle';
import {
  ModalityUnitOptions,
  getModalityUnit,
} from '../utilities/getModalityUnit';
import {
  getCanvasCircleCorners,
  getCanvasCircleRadius,
} from '../utilities/math/circle';
import { pointInEllipse } from '../utilities/math/ellipse';
import AdvancedMagnifyViewportManager from './AdvancedMagnifyViewportManager';

const { transformWorldToIndex } = csUtils;

class AdvancedMagnifyTool extends AnnotationTool {
  static toolName;

  magnifyViewportManager: AdvancedMagnifyViewportManager;
  touchDragCallback: any;
  mouseDragCallback: any;
  editData: {
    annotation: any;
    viewportIdsToRender: Array<string>;
    handleIndex?: number;
    centerCanvas?: Array<number>;
    newAnnotation?: boolean;
    hasMoved?: boolean;
  } | null;
  isDrawing: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        magnifyZoomFactor: 2.5,
        magnifyRadius: 125, // px
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.magnifyViewportManager = AdvancedMagnifyViewportManager.getInstance();
  }

  _getWorldHandlesPoints = (
    viewport,
    canvasCenterPos,
    canvasRadius
  ): Types.Point3[] => {
    const canvasHandlesPoints = [
      [canvasCenterPos[0], canvasCenterPos[1] - canvasRadius], // top
      [canvasCenterPos[0] + canvasRadius, canvasCenterPos[1]], // right
      [canvasCenterPos[0], canvasCenterPos[1] + canvasRadius], // bottom
      [canvasCenterPos[0] - canvasRadius, canvasCenterPos[1]], // left
    ];

    const worldHandlesPoints = canvasHandlesPoints.map((p) =>
      viewport.canvasToWorld(p)
    ) as Types.Point3[];

    // console.log('>>>>> handle :: center :: canvas:', canvasCenterPos);
    // console.log('>>>>> handle :: radius :: canvas:', canvasRadius);
    // console.log('>>>>> handle :: points :: canvas:', canvasHandlesPoints);
    // console.log('>>>>> handle :: points :: world:', worldHandlesPoints);

    return worldHandlesPoints;
  };

  // _getRadiusInWorldSpace = (viewport, canvasRadius) => {
  //   const worldP1 = viewport.canvasToWorld([0, 0]);
  //   const worldP2 = viewport.canvasToWorld([canvasRadius, 0]);
  //   const deltaX = worldP2[0] - worldP1[0];
  //   const deltaY = worldP2[1] - worldP1[1];

  //   return Math.sqrt(deltaX ** 2 + deltaY ** 2);
  // };

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a CircleROI Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): AdvancedMagnifyAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;
    const worldPos = currentPoints.world;
    const canvasPos = currentPoints.canvas;
    const { magnifyRadius } = this.configuration;

    console.log('>>>>> create :: canvas:', canvasPos);
    console.log('>>>>> create :: world:', worldPos);

    const worldHandlesPoints = this._getWorldHandlesPoints(
      viewport,
      canvasPos,
      magnifyRadius
    );

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

    const magnifyViewportId = this.magnifyViewportManager.createViewport({
      parentEnabledElement: enabledElement,
      referencedImageId,
      position: canvasPos,
      radius: magnifyRadius,
    });

    console.log('>>>>> create :: magnifyViewportId:', magnifyViewportId);

    const annotation: AdvancedMagnifyAnnotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID,
        referencedImageId,
      },
      data: {
        magnifyViewportId,
        // center: [...worldPos],
        // radius: worldRadius,
        handles: {
          points: worldHandlesPoints,
          activeHandleIndex: null,
        },
      },
    };

    addAnnotation(annotation, element);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      // centerCanvas: canvasPos,
      newAnnotation: true,
    };
    this._activateDraw(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

  /**
   * It returns if the canvas point is near the provided annotation in the provided
   * element or not. A proximity is passed to the function to determine the
   * proximity of the point to the annotation in number of pixels.
   *
   * @param element - HTML Element
   * @param annotation - Annotation
   * @param canvasCoords - Canvas coordinates
   * @param proximity - Proximity to tool to consider
   * @returns Boolean, whether the canvas point is near tool
   */
  isPointNearTool = (
    element: HTMLDivElement,
    annotation: AdvancedMagnifyAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const { data } = annotation;
    const { points } = data.handles;

    // For some reason Typescript doesn't understand this, so we need to be
    // more specific about the type
    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p)) as [
      Types.Point2,
      Types.Point2,
      Types.Point2,
      Types.Point2
    ];

    const [canvasTop, canvasRight, canvasBottom, canvasLeft] =
      canvasCoordinates;
    const radius = Math.abs(canvasBottom[1] - canvasTop[1]) * 0.5;
    const center = [
      canvasLeft[0] + radius,
      canvasTop[1] + radius,
    ] as Types.Point2;
    const radiusPoint = getCanvasCircleRadius([center, canvasCoords]);

    if (Math.abs(radiusPoint - radius) < proximity / 2) {
      return true;
    }

    return false;
  };

  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: AdvancedMagnifyAnnotation
  ): void => {
    console.log('>>>>> toolSelectedCallback');

    const eventDetail = evt.detail;
    const { element } = eventDetail;

    annotation.highlighted = true;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
    };

    hideElementCursor(element);

    this._activateModify(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    evt.preventDefault();
  };

  handleSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: AdvancedMagnifyAnnotation,
    handle: ToolHandle
  ): void => {
    console.log('>>>>> handleSelectedCallback');

    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { data } = annotation;

    annotation.highlighted = true;

    const { points } = data.handles;
    const handleIndex = points.findIndex((p) => p === handle);

    // Find viewports to render on drag.
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex,
    };
    this._activateModify(element);

    hideElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    evt.preventDefault();
  };

  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, newAnnotation, hasMoved } =
      this.editData;
    const { data } = annotation;

    // if (newAnnotation && !hasMoved) {
    //   return;
    // }

    // Circle ROI tool should reset its highlight to false on mouse up (as opposed
    // to other tools that keep it highlighted until the user moves. The reason
    // is that we use top-left and bottom-right handles to define the circle,
    // and they are by definition not in the circle on mouse up.
    annotation.highlighted = false;
    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);
    this._deactivateDraw(element);

    resetElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    this.editData = null;
    this.isDrawing = false;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    if (newAnnotation) {
      const eventType = Events.ANNOTATION_COMPLETED;

      const eventDetail: AnnotationCompletedEventDetail = {
        annotation,
      };

      triggerEvent(eventTarget, eventType, eventDetail);
    }
  };

  _dragDrawCallback = (evt: EventTypes.InteractionEventType): void => {
    console.log('>>>>> dragDrawCallback');

    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element, deltaPoints } = eventDetail;
    const worldPosDelta = deltaPoints?.world ?? [0, 0, 0];
    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    const { annotation, viewportIdsToRender } = this.editData;
    const { points } = annotation.data.handles;

    points.forEach((point) => {
      point[0] += worldPosDelta[0];
      point[1] += worldPosDelta[1];
      point[2] += worldPosDelta[2];
    });

    annotation.invalidated = true;
    this.editData.hasMoved = true;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  _dragModifyCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, handleIndex } = this.editData;
    const { data } = annotation;

    if (handleIndex === undefined) {
      // Moving tool
      const { deltaPoints } = eventDetail;
      const worldPosDelta = deltaPoints.world;

      const points = data.handles.points;

      points.forEach((point) => {
        point[0] += worldPosDelta[0];
        point[1] += worldPosDelta[1];
        point[2] += worldPosDelta[2];
      });
      annotation.invalidated = true;
    } else {
      this._dragHandle(evt);
      annotation.invalidated = true;
    }

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  _dragHandle = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { worldToCanvas } = viewport;

    const { annotation } = this.editData;
    const { data } = annotation;
    const { points } = data.handles;

    const canvasCoordinates = points.map((p) => worldToCanvas(p));
    const [canvasTop, canvasRight, canvasBottom, canvasLeft] =
      canvasCoordinates;
    const radius = Math.abs(canvasBottom[1] - canvasTop[1]) * 0.5;
    const canvasCenter: Types.Point2 = [
      canvasLeft[0] + radius,
      canvasTop[1] + radius,
    ];

    const { currentPoints } = eventDetail;
    const currentCanvasPoints = currentPoints.canvas;

    const newRadius = getCanvasCircleRadius([
      canvasCenter,
      currentCanvasPoints,
    ]);
    const newWorldHandlesPoints = this._getWorldHandlesPoints(
      viewport,
      canvasCenter,
      newRadius
    );

    points[0] = newWorldHandlesPoints[0];
    points[1] = newWorldHandlesPoints[1];
    points[2] = newWorldHandlesPoints[2];
    points[3] = newWorldHandlesPoints[3];
  };

  cancel = (element: HTMLDivElement) => {
    // If it is mid-draw or mid-modify
    if (this.isDrawing) {
      this.isDrawing = false;
      this._deactivateDraw(element);
      this._deactivateModify(element);
      resetElementCursor(element);

      const { annotation, viewportIdsToRender, newAnnotation } = this.editData;
      const { data } = annotation;

      annotation.highlighted = false;
      data.handles.activeHandleIndex = null;

      const enabledElement = getEnabledElement(element);
      const { renderingEngine } = enabledElement;

      triggerAnnotationRenderForViewportIds(
        renderingEngine,
        viewportIdsToRender
      );

      if (newAnnotation) {
        const eventType = Events.ANNOTATION_COMPLETED;

        const eventDetail: AnnotationCompletedEventDetail = {
          annotation,
        };

        triggerEvent(eventTarget, eventType, eventDetail);
      }

      this.editData = null;
      return annotation.annotationUID;
    }
  };

  _activateModify = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragModifyCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.addEventListener(Events.TOUCH_END, this._endCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._dragModifyCallback);
    element.addEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  _deactivateModify = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragModifyCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.removeEventListener(Events.TOUCH_END, this._endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._dragModifyCallback);
    element.removeEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  _activateDraw = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragDrawCallback);
    element.addEventListener(Events.MOUSE_MOVE, this._dragDrawCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.addEventListener(Events.TOUCH_END, this._endCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._dragDrawCallback);
    element.addEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  _deactivateDraw = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragDrawCallback);
    element.removeEventListener(Events.MOUSE_MOVE, this._dragDrawCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.removeEventListener(Events.TOUCH_END, this._endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._dragDrawCallback);
    element.removeEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  /**
   * it is used to draw the circleROI annotation in each
   * request animation frame. It calculates the updated cached statistics if
   * data is invalidated and cache it.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    let renderStatus = false;
    const { viewport } = enabledElement;
    const { element } = viewport;

    let annotations = getAnnotations(this.getToolName(), element);

    if (!annotations?.length) {
      return renderStatus;
    }

    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    );

    if (!annotations?.length) {
      return renderStatus;
    }

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as AdvancedMagnifyAnnotation;
      const { annotationUID, data } = annotation;
      const { magnifyViewportId, handles } = data;
      const { points, activeHandleIndex } = handles;

      styleSpecifier.annotationUID = annotationUID;

      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
      const color = this.getStyle('color', styleSpecifier, annotation);

      const canvasCoordinates = points.map((p) =>
        viewport.worldToCanvas(p)
      ) as Types.Point2[];
      const [canvasTop, canvasRight, canvasBottom, canvasLeft] =
        canvasCoordinates;
      const radius = Math.abs(canvasBottom[1] - canvasTop[1]) * 0.5;
      const center = [
        canvasLeft[0] + radius,
        canvasTop[1] + radius,
      ] as Types.Point2;

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      let activeHandleCanvasCoords;

      if (!isAnnotationVisible(annotationUID)) {
        continue;
      }

      if (
        !isAnnotationLocked(annotation) &&
        !this.editData &&
        activeHandleIndex !== null
      ) {
        // Not locked or creating and hovering over handle, so render handle.
        activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]];
      }

      if (activeHandleCanvasCoords) {
        const handleGroupUID = '0';
        drawHandlesSvg(
          svgDrawingHelper,
          annotationUID,
          handleGroupUID,
          activeHandleCanvasCoords,
          {
            color,
          }
        );
      }

      const dataId = `${annotationUID}-advancedMagnify`;
      const circleUID = '0';
      drawCircleSvg(
        svgDrawingHelper,
        annotationUID,
        circleUID,
        center,
        radius,
        {
          color,
          lineDash,
          lineWidth,
        },
        dataId
      );

      const magnifyViewport =
        this.magnifyViewportManager.getViewport(magnifyViewportId);

      magnifyViewport.position = center;
      magnifyViewport.radius = radius;
      magnifyViewport.update();

      renderStatus = true;
    }

    return renderStatus;
  };
}

AdvancedMagnifyTool.toolName = 'AdvancedMagnify';
export default AdvancedMagnifyTool;
