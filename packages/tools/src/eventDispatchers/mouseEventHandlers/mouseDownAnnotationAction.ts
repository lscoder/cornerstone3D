import { state } from '../../store';
import { ToolModes } from '../../enums';
import { EventTypes } from '../../types';

// Util
import filterToolsWithAnnotationsForElement from '../../store/filterToolsWithAnnotationsForElement';
import filterMoveableAnnotationTools from '../../store/filterMoveableAnnotationTools';
import getToolsWithActionsForMouseEvent from '../shared/getToolsWithActionsForMouseEvent';

const { Active, Passive } = ToolModes;

export default function mouseDownAnnotationAction(
  evt: EventTypes.MouseDownEventType
) {
  // If a tool has locked the current state it is dealing with an interaction within its own eventLoop.
  if (state.isInteractingWithTool) {
    return;
  }

  const eventDetail = evt.detail;
  const { element } = eventDetail;
  const { canvas: canvasCoords } = eventDetail.currentPoints;

  // Find all tools that might respond to this mouse down
  const toolsWithActions = getToolsWithActionsForMouseEvent(evt, [
    Active,
    Passive,
  ]);

  const tools = Array.from(toolsWithActions.keys());

  // Filter tools with annotations for this element
  const annotationToolsWithAnnotations = filterToolsWithAnnotationsForElement(
    element,
    tools
  );

  // Only moveable annotations (unlocked, visible and close to the canvas coordinates) may trigger actions
  const moveableAnnotationTools = filterMoveableAnnotationTools(
    element,
    annotationToolsWithAnnotations,
    canvasCoords
  );

  // If there are annotation tools that are interactable, select the first one
  // that isn't locked. If there's only one annotation tool, select it.
  if (moveableAnnotationTools.length > 0) {
    const { tool, annotation } = moveableAnnotationTools[0];
    const action = toolsWithActions.get(tool);
    const method =
      typeof action.method === 'string' ? tool[action.method] : action.method;

    method.call(tool, evt, annotation);

    return true;
  }

  return false;
}
