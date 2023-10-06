import { getAnnotations } from '../../stateManagement/annotation/annotationState';
import { BaseTool, AdvancedMagnifyTool } from '../../tools';
import { ToolGroupManager } from '../../store';
import { EventTypes } from '../../types';
import { ToolModes } from '../../enums';

export default function handleMagnifyingGlassSomething(
  evt: EventTypes.InteractionEventType
): void {
  // console.log('>>>>> MG :: handling event', evt);
  // const modesFilter = new Set<ToolModes>([ToolModes.Active, ToolModes.Passive]);
  // const { element, renderingEngineId, viewportId } = evt.detail;
  // const toolGroup = ToolGroupManager.getToolGroupForViewport(
  //   viewportId,
  //   renderingEngineId
  // );
  // console.log('>>>>> toolGroup ok:', !!toolGroup);
  // if (!toolGroup) {
  //   return;
  // }
  // const advancedMmagnifyToolOptions =
  //   toolGroup.toolOptions[AdvancedMagnifyTool.name];
  // console.log(
  //   '>>>>> advancedMmagnifyToolOptions ok:',
  //   !!advancedMmagnifyToolOptions
  // );
  // if (!modesFilter.has(advancedMmagnifyToolOptions?.mode)) {
  //   return;
  // }
  // const magnifyToolInstance = toolGroup.getToolInstance(
  //   AdvancedMagnifyTool.name
  // );
  // console.log('>>>>> magnifyToolInstance ok:', !!magnifyToolInstance);
  // const annotations = getAnnotations(AdvancedMagnifyTool.toolName, element);
  // console.log('>>>>> annotations ok:', !!annotations);
  // console.log('>>>>> annotations: ', annotations);
}
