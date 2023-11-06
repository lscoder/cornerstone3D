import {
  defaultParameterMap,
  elastix,
  DefaultParameterMapOptions,
  DefaultParameterMapResult,
  ElastixOptions,
} from '@itk-wasm/elastix';
import {
  Image,
  ImageType,
  IntTypes,
  FloatTypes,
  PixelTypes,
  Metadata,
} from 'itk-wasm';
import {
  RenderingEngine,
  Types,
  Enums,
  cache,
  volumeLoader,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  setCtTransferFunctionForVolumeActor,
  setTitleAndDescription,
  addButtonToToolbar,
  addNumberInputToToolbar,
} from '../../../../utils/demo/helpers';
import * as cornerstoneTools from '@cornerstonejs/tools';
import addDropDownToToolbar from '../../../../utils/demo/helpers/addDropdownToToolbar';
import {
  defaultNumberOfResolutions,
  defaultFinalGridSpacing,
  parametersSettings,
} from './elastixParametersSettings';
import { getImageIds, stringify } from './utils';
import RegistrationConsole from './RegistrationConsole';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const DOWNSAMPLE_VOLUME = false;

const dataTypesMap = {
  Int8: IntTypes.Int8,
  UInt8: IntTypes.UInt8,
  Int16: IntTypes.Int16,
  UInt16: IntTypes.UInt16,
  Int32: IntTypes.Int32,
  UInt32: IntTypes.UInt32,
  Int64: IntTypes.Int64,
  UInt64: IntTypes.UInt64,
  Float32: FloatTypes.Float32,
  Float64: FloatTypes.Float64,
};

const {
  WindowLevelTool,
  StackScrollMouseWheelTool,
  ToolGroupManager,
  Enums: csToolsEnums,
} = cornerstoneTools;

const { ViewportType } = Enums;
const { MouseBindings } = csToolsEnums;
const renderingEngineId = 'myRenderingEngine';
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const toolGroupIds = new Set<string>();
let webWorker = null;

const volumesInfo = [
  {
    volumeId: `${volumeLoaderScheme}:CT_VOLUME_ID_1`,

    // Neptune
    // wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
    // StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125095438.5',
    // SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125095449.8',

    // Juno
    wadoRsRoot: 'http://localhost/dicom-web',
    StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125112931.11',
    SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113028.6',
  },
  {
    volumeId: `${volumeLoaderScheme}:CT_VOLUME_ID_2`,

    // Neptune
    // wadoRsRoot: 'https://d33do7qe4w26qo.cloudfront.net/dicomweb',
    // StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125095258.1',
    // SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125095305.12',

    // Juno
    wadoRsRoot: 'http://localhost/dicom-web',
    StudyInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113417.1',
    SeriesInstanceUID: '1.3.6.1.4.1.25403.345050719074.3824.20170125113420.1',
  },
];

const viewportsInfo = [
  {
    toolGroupId: 'VOLUME_TOOLGROUP_ID',
    volumeInfo: volumesInfo[0],
    viewportInput: {
      viewportId: 'CT_VOLUME_FIXED',
      type: ViewportType.ORTHOGRAPHIC,
      element: null,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  },
  {
    toolGroupId: 'VOLUME_TOOLGROUP_ID',
    volumeInfo: volumesInfo[1],
    viewportInput: {
      viewportId: 'CT_VOLUME_MOVING',
      type: ViewportType.ORTHOGRAPHIC,
      element: null,
      defaultOptions: {
        orientation: Enums.OrientationAxis.CORONAL,
        background: <Types.Point3>[0.2, 0, 0.2],
      },
    },
  },
];

const transformNames = [
  'translation',
  'rigid',
  'affine',
  'bspline',
  'spline',
  // 'groupwise', // 2D+time or 3D+time
];

let activeTransformName = transformNames[1];
let currentParameterMap = {};

const defaultParameterMaps = {};

// ==[ Set up page ]============================================================

setTitleAndDescription(
  'Registration',
  'Spatially align two volumes from different frames of reference'
);

const content = document.getElementById('content');
const viewportGrid = document.createElement('div');

Object.assign(viewportGrid.style, {
  display: 'grid',
  gridTemplateColumns: `1fr 1fr`,
  width: '100%',
  height: '400px',
  paddingTop: '5px',
  gap: '5px',
});

content.appendChild(viewportGrid);

const regConsole = new RegistrationConsole(content);

// ==[ Toolbar ]================================================================
const toolbar = document.getElementById('demo-toolbar');
const toolbarTransformSection = document.createElement('div');
const toolbarParamsSection = document.createElement('div');

[toolbarTransformSection, toolbarParamsSection].forEach((toolbarSection) => {
  toolbarSection.style.margin = '0px 0px 10px';
});

// Parameters container
const toolbarParamsContainer = document.createElement('fieldset');
const toolbarParamsContainerLegend = document.createElement('legend');

toolbarParamsContainer.style.display = 'grid';
toolbarParamsContainer.style.gridTemplateColumns = 'repeat(2, max-content 1fr)';

toolbarParamsContainerLegend.innerText = 'Parameters';

toolbarParamsContainer.appendChild(toolbarParamsContainerLegend);
toolbarParamsSection.appendChild(toolbarParamsContainer);

toolbar.append(toolbarTransformSection, toolbarParamsSection);

addDropDownToToolbar({
  labelText: 'Transform ',
  container: toolbarTransformSection,
  options: {
    values: transformNames,
    defaultValue: activeTransformName,
  },
  onSelectedValueChange: (value) => {
    activeTransformName = value.toString();
    loadParameterMap(activeTransformName);
  },
});

Object.keys(parametersSettings).forEach((parameterName) => {
  const parameterSettings = parametersSettings[parameterName];
  const { inputType, defaultValue } = parameterSettings;
  const id = parameterName;
  const onChange = (newValue: string | number) => {
    newValue = newValue.toString();

    // Some parameters need to update a global variable
    parameterSettings.onChange?.(newValue);

    if (newValue === '') {
      delete currentParameterMap[parameterName];
    } else {
      currentParameterMap[parameterName] = [newValue];
    }
  };

  const label = document.createElement('label');
  label.htmlFor = id;
  label.innerText = parameterName;
  label.style.margin = '0px 5px';
  toolbarParamsContainer.append(label);

  if (inputType === 'number') {
    const { step = 1 } = parameterSettings;

    addNumberInputToToolbar({
      id,
      value: defaultValue ?? 0,
      step,
      container: toolbarParamsContainer,
      onChange,
    });
  } else if (inputType === 'dropdown') {
    const { values } = parameterSettings;
    const dropdownValues = ['', ...values];

    addDropDownToToolbar({
      id,
      options: {
        values: dropdownValues,
        defaultValue: defaultValue ?? dropdownValues[0],
      },
      container: toolbarParamsContainer,
      onSelectedValueChange: onChange,
    });
  }
});

addButtonToToolbar({
  id: 'btnRegister',
  title: 'Register volumes',
  onClick: async () => {
    regConsole.clear();

    // Fake call just to get a new webWorker because we need to make sure
    // it will be destroyed even if an error occur during registration
    // Is there a better way to get a WebWorker?
    const { webWorker } = await defaultParameterMap(undefined, 'rigid', {
      numberOfResolutions: 4,
    });

    // Use the same parameter map updated by the user
    const parameterMap = currentParameterMap;

    regConsole.log(`Parameters map:\n${stringify(parameterMap, 4)}`, true);

    const [fixedViewportInfo, movingViewportInfo] = viewportsInfo;
    const { viewportId: fixedViewportId } = fixedViewportInfo.viewportInput;
    const { viewportId: movingViewportId } = movingViewportInfo.viewportInput;
    const fixedImage = getImageFromViewport(fixedViewportId, 'fixed');
    const movingImage = getImageFromViewport(movingViewportId, 'moving');

    regConsole.logImageInfo(fixedImage);
    regConsole.logImageInfo(movingImage);

    const elastixOptions: ElastixOptions = {
      fixed: fixedImage,
      moving: movingImage,
      initialTransform: undefined,
      initialTransformParameterObject: undefined,
    };

    regConsole.log(`Registration in progress (${activeTransformName})...`);

    console.log('Registration:');
    console.log('    parameterMap:', parameterMap);
    console.log('    options:', elastixOptions);

    try {
      const startTime = performance.now();
      const elastixResult = await elastix(
        webWorker,
        [parameterMap],
        'transform.h5',
        elastixOptions
      );

      const totalTime = performance.now() - startTime;
      const { result, transform, transformParameterObject } = elastixResult;

      console.log('Elastix result');
      console.log('    result:', result);
      console.log('    transform:', transform);
      console.log('    transformParameterObject:', transformParameterObject);

      regConsole.log(
        `transformParameterObject:\n${stringify(transformParameterObject, 4)}`,
        true
      );

      regConsole.log('Resulting image:');
      regConsole.logImageInfo(result);
      regConsole.logTransform(transform);
      regConsole.log(`Total time: ${(totalTime / 1000).toFixed(3)} seconds`);
      regConsole.log('Registration complete');
    } catch (error: any) {
      window.error = error;
      let message = 'unknown error';

      if (typeof error === 'string') {
        message = error.toUpperCase();
      } else if (error.message) {
        message = error.message;
      }

      regConsole.log(`An error ocurred during : ${message}`);
      console.log('Error: ', error);
    } finally {
      webWorker.terminate();
    }
  },
});

// =============================================================================

async function getElastixParameterMap(
  transformName: string
): Promise<DefaultParameterMapResult> {
  const parameterMapOptions: DefaultParameterMapOptions = {
    numberOfResolutions: defaultNumberOfResolutions,
    finalGridSpacing: defaultFinalGridSpacing,
  };

  const parameterMap: DefaultParameterMapResult = await defaultParameterMap(
    webWorker,
    transformName,
    parameterMapOptions
  );

  webWorker = parameterMap.webWorker;

  return parameterMap;
}

async function loadAndCacheAllParameterMaps() {
  for (let i = 0, len = transformNames.length; i < len; i++) {
    const transformName = transformNames[i];
    const { parameterMap } = await getElastixParameterMap(transformName);

    parameterMap['AutomaticTransformInitialization'] = ['true'];

    if (transformName === 'rigid') {
      parameterMap['FixedInternalImagePixelType'] = ['float'];
      parameterMap['MovingInternalImagePixelType'] = ['float'];
      parameterMap['Registration'] = ['MultiResolutionRegistration'];
      parameterMap['Interpolator'] = ['BSplineInterpolator'];
      parameterMap['ResampleInterpolator'] = ['FinalBSplineInterpolator'];
      parameterMap['Resampler'] = ['DefaultResampler'];
      parameterMap['FixedImagePyramid'] = ['FixedSmoothingImagePyramid'];
      parameterMap['MovingImagePyramid'] = ['MovingSmoothingImagePyramid'];
      parameterMap['Optimizer'] = ['AdaptiveStochasticGradientDescent'];
      parameterMap['Transform'] = ['EulerTransform'];
      parameterMap['Metric'] = ['AdvancedMattesMutualInformation'];
      parameterMap['AutomaticScalesEstimation'] = ['true'];
      parameterMap['AutomaticTransformInitialization'] = ['true'];
      parameterMap['HowToCombineTransforms'] = ['Compose'];
      parameterMap['ITKTransformOutputFileNameExtension'] = ['h5'];
      parameterMap['WriteITKCompositeTransform'] = ['true'];
      parameterMap['NumberOfHistogramBins'] = ['64'];
      parameterMap['ErodeMask'] = ['false'];
      parameterMap['NumberOfResolutions'] = ['3'];
      parameterMap['ImagePyramidSchedule'] = '8 8 8 4 4 4 2 2 2 1 1 1'.split(
        ' '
      );
      parameterMap['MaximumNumberOfIterations'] = ['500'];
      parameterMap['MaximumStepLength'] = ['1.0'];
      parameterMap['RequiredRatioOfValidSamples'] = ['0.05'];
      parameterMap['NumberOfSpatialSamples'] = ['2000'];
      parameterMap['NewSamplesEveryIteration'] = ['true'];
      parameterMap['ImageSampler'] = ['Random'];
    } else if (transformName === 'affine') {
      parameterMap['FixedInternalImagePixelType'] = ['float'];
      parameterMap['MovingInternalImagePixelType'] = ['float'];
      parameterMap['Registration'] = ['MultiResolutionRegistration'];
      parameterMap['Interpolator'] = ['BSplineInterpolator'];
      parameterMap['ResampleInterpolator'] = ['FinalBSplineInterpolator'];
      parameterMap['Resampler'] = ['DefaultResampler'];
      parameterMap['FixedImagePyramid'] = ['FixedSmoothingImagePyramid'];
      parameterMap['MovingImagePyramid'] = ['MovingSmoothingImagePyramid'];
      parameterMap['Optimizer'] = ['AdaptiveStochasticGradientDescent'];
      parameterMap['Transform'] = ['AffineTransform'];
      parameterMap['Metric'] = ['AdvancedNormalizedCorrelation'];
      parameterMap['AutomaticScalesEstimation'] = ['true'];
      parameterMap['AutomaticTransformInitialization'] = ['true'];
      parameterMap['HowToCombineTransforms'] = ['Compose'];
      parameterMap['ITKTransformOutputFileNameExtension'] = ['h5'];
      parameterMap['WriteITKCompositeTransform'] = ['true'];
      parameterMap['NumberOfHistogramBins'] = ['32'];
      parameterMap['ErodeMask'] = ['false'];
      parameterMap['NumberOfResolutions'] = ['4'];
      parameterMap['ImagePyramidSchedule'] = [
        '40 40 4 20 20 2 10 10 1 5 5 1'.split(' '),
      ];
      parameterMap['MaximumNumberOfIterations'] = ['1000'];
      parameterMap['NumberOfSpatialSamples'] = ['3000'];
      parameterMap['NewSamplesEveryIteration'] = ['true'];
      parameterMap['ImageSampler'] = ['RandomCoordinate'];
      parameterMap['BSplineInterpolationOrder'] = ['1'];
      parameterMap['FinalBSplineInterpolationOrder'] = ['3'];
      parameterMap['DefaultPixelValue'] = ['0'];
      parameterMap['WriteResultImage'] = ['false'];
      parameterMap['ResultImagePixelType'] = ['short'];
      parameterMap['ResultImageFormat'] = ['mhd'];
    }

    defaultParameterMaps[transformName] = parameterMap;
    console.log(`Default parameter map (${transformName}):`, parameterMap);
  }
}

/**
 * Update the screen with all parameter values for a given transformation
 * @param transformName - Transformation name
 */
function loadParameterMap(transformName: string) {
  const parameterMap = defaultParameterMaps[transformName];

  // Update the current parameter map that shall be updated on every input change
  currentParameterMap = parameterMap;

  // For each parameters that has settings which means an input field on the screen
  Object.keys(parametersSettings).forEach((parameterName) => {
    const parameterSettings = parametersSettings[parameterName];
    const parameterValues = parameterMap[parameterName];
    const input = document.getElementById(parameterName) as HTMLInputElement;

    // Disable the input field if there is the parameter is not
    // in the default parameter map
    input.disabled = !parameterValues;

    if (!parameterValues) {
      return;
    }

    // Get the first value because the values are always stored as an array
    const parameterValue = parameterValues[0];

    // Update the input field
    input.value = parameterValue;

    // Some parameters needs to update a global variable
    parameterSettings.onLoad?.(parameterValue);
  });
}

function downsampleVolume(srcDimensions, srcScalarData) {
  const newDimensions = [
    Math.floor(srcDimensions[0] / 2),
    Math.floor(srcDimensions[1] / 2),
    srcDimensions[2], // Math.floor(srcDimensions[2] / 2),
  ];
  const [newWidth, newHeight, newDepth] = newDimensions;

  // Multiplied by 2 because it's a Int16Array
  const bufferSize = newWidth * newHeight * newDepth * 2;
  const sharedArrayBuffer = new SharedArrayBuffer(bufferSize);
  const newScalarData = new Int16Array(sharedArrayBuffer);

  const srcVoxelsPerSlice = srcDimensions[0] * srcDimensions[1];
  let srcPixelIndex = 0;
  let srcVoxelFront00 = 0;
  let srcVoxelFront01 = srcVoxelFront00 + 1;
  let srcVoxelFront10 = srcVoxelFront00 + srcDimensions[0];
  let srcVoxelFront11 = srcVoxelFront10 + 1;
  // let srcVoxelBack00 = srcVoxelFront00 + srcVoxelsPerSlice;
  // let srcVoxelBack01 = srcVoxelBack00 + 1;
  // let srcVoxelBack10 = srcVoxelBack00 + srcDimensions[0];
  // let srcVoxelBack11 = srcVoxelBack10 + 1;

  let newVoxelIndex = 0;

  for (let xNew = 0; xNew < newWidth; xNew++) {
    for (let yNew = 0; yNew < newHeight; yNew++) {
      for (let zNew = 0; zNew < newDepth; zNew++) {
        // const xOriginal = 2 * xNew;
        // const yOriginal = 2 * yNew;
        // const zOriginal = 2 * zNew;

        // Compute the average value of the 2x2x2 block in the original volume
        const averageValue =
          (srcScalarData[srcVoxelFront00] +
            srcScalarData[srcVoxelFront01] +
            srcScalarData[srcVoxelFront10] +
            srcScalarData[srcVoxelFront11]) /
          4;

        // (srcScalarData[srcPixelIndex] +
        //   srcScalarData[srcPixelIndex + 1] +
        //   srcScalarData[srcPixelIndex + srcDimensions[0]] +
        //   srcScalarData[srcPixelIndex + srcDimensions[0] + 1]) /
        // 4;

        // srcScalarData[srcVoxelBack00] +
        // srcScalarData[srcVoxelBack01] +
        // srcScalarData[srcVoxelBack10] +
        // srcScalarData[srcVoxelBack11]

        // Set the voxel in the new volume to the computed average value
        newScalarData[newVoxelIndex] = averageValue;
        newVoxelIndex++;

        srcPixelIndex += 2;
        srcVoxelFront00 += 2;
        srcVoxelFront01 += 2;
        srcVoxelFront10 += 2;
        srcVoxelFront11 += 2;
        // srcVoxelBack00 += 2;
        // srcVoxelBack01 += 2;
        // srcVoxelBack10 += 2;
        // srcVoxelBack11 += 2;
      }
    }
  }

  return {
    dimentions: newDimensions,
    scalarData: newScalarData,
  };
}

/**
 * Get the ITK Image from a given viewport
 * @param viewportId - Viewport Id
 * @param imageName - Any random name that shall be set in the image
 * @returns An ITK Image that can be used as fixed or moving image
 */
function getImageFromViewport(viewportId, imageName?: string): Image {
  const renderingEngine = getRenderingEngine(renderingEngineId);
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
  );

  const { actor: volumeActor } = viewport.getDefaultActor();
  const imageData = volumeActor.getMapper().getInputData();
  const pointData = imageData.getPointData();
  const scalars = pointData.getScalars();
  let dimensions = imageData.getDimensions();
  const origin = imageData.getOrigin();
  let spacing = imageData.getSpacing();
  const directionArray = imageData.getDirection();
  const direction = new Float64Array(directionArray);
  const numComponents = pointData.getNumberOfComponents();
  // const dataType = scalars.getDataType().replace(/^Ui/, 'UI').replace(/Array$/, '');
  const dataType = 'Int16';
  const metadata: Metadata = undefined;
  let scalarData = scalars.getData();

  if (DOWNSAMPLE_VOLUME) {
    regConsole.log(`Downsampling volume (${imageName})...`);

    const startTime = Date.now();
    const downsampledVolumeData = downsampleVolume(dimensions, scalarData);
    const totalTime = Date.now() - startTime;
    const oldDimensions = [...dimensions];

    scalarData = downsampledVolumeData.scalarData;
    dimensions = downsampledVolumeData.dimentions;

    regConsole.log(`Volume (${imageName}) downsampled in ${totalTime} ms`);
    regConsole.log(`old dimensions: [${oldDimensions.join(',')}]`);
    regConsole.log(`new dimentions: [${dimensions.join(',')}]`);
    regConsole.log(`old spacing: [${spacing.join(',')}]`);

    spacing = spacing.map(
      (value, i) => (value * oldDimensions[i]) / dimensions[i]
    );

    regConsole.log(`new spacing: ${spacing.join(',')}`);
  }

  const imageType: ImageType = new ImageType(
    dimensions.length,
    dataTypesMap[dataType],
    PixelTypes.Scalar,
    numComponents
  );

  const image = new Image(imageType);

  image.name = imageName;
  image.origin = origin;
  image.spacing = spacing;
  image.direction = direction;
  image.size = dimensions;
  image.metadata = metadata;
  // image.data = scalarData;
  image.data = scalarData;

  // image.data = new scalarData.constructor(scalarData.length);
  // image.data.set(scalarData, 0);

  // image.data = new Int16Array(originalPixelData.length);
  // image.data.set(originalPixelData, 0);

  return image;
}

async function initializeVolumeViewport(
  viewport: Types.IVolumeViewport,
  volumeId: string,
  imageIds: string[]
) {
  let volume = cache.getVolume(volumeId) as any;

  if (!volume) {
    volume = await volumeLoader.createAndCacheVolume(volumeId, {
      imageIds,
    });

    // Set the volume to load
    volume.load();
  }

  // Set the volume on the viewport
  await viewport.setVolumes([
    { volumeId, callback: setCtTransferFunctionForVolumeActor },
  ]);

  return volume;
}

async function initializeViewport(
  renderingEngine,
  toolGroup,
  viewportInfo,
  imageIds,
  volumeId
) {
  const { viewportInput } = viewportInfo;
  const element = document.createElement('div');

  // Disable right click context menu so we can have right click tools
  element.oncontextmenu = (e) => e.preventDefault();

  element.id = viewportInput.viewportId;
  element.style.overflow = 'hidden';

  viewportInput.element = element;
  viewportGrid.appendChild(element);

  const { viewportId } = viewportInput;
  const { id: renderingEngineId } = renderingEngine;

  renderingEngine.enableElement(viewportInput);

  // Set the tool group on the viewport
  toolGroup.addViewport(viewportId, renderingEngineId);

  // Get the stack viewport that was created
  const viewport = <Types.IViewport>renderingEngine.getViewport(viewportId);

  if (viewportInput.type === ViewportType.STACK) {
    // Set the stack on the viewport
    (<Types.IStackViewport>viewport).setStack(imageIds);
  } else if (viewportInput.type === ViewportType.ORTHOGRAPHIC) {
    await initializeVolumeViewport(
      viewport as Types.IVolumeViewport,
      volumeId,
      imageIds
    );
  } else {
    throw new Error('Invalid viewport type');
  }

  regConsole.log(
    `Viewport ${viewportId} initialized (${imageIds.length} slices)`
  );
}

function initializeToolGroup(toolGroupId) {
  let toolGroup = ToolGroupManager.getToolGroup(toolGroupId);

  if (toolGroup) {
    return toolGroup;
  }

  // Define a tool group, which defines how mouse events map to tool commands for
  // Any viewport using the group
  toolGroup = ToolGroupManager.createToolGroup(toolGroupId);

  // Add the tools to the tool group
  toolGroup.addTool(WindowLevelTool.toolName);
  toolGroup.addTool(StackScrollMouseWheelTool.toolName);

  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [
      {
        mouseButton: MouseBindings.Secondary, // Right Click
      },
    ],
  });

  // As the Stack Scroll mouse wheel is a tool using the `mouseWheelCallback`
  // hook instead of mouse buttons, it does not need to assign any mouse button.
  toolGroup.setToolActive(StackScrollMouseWheelTool.toolName);

  return toolGroup;
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  // Add tools to Cornerstone3D
  cornerstoneTools.addTool(WindowLevelTool);
  cornerstoneTools.addTool(StackScrollMouseWheelTool);

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  for (let i = 0; i < viewportsInfo.length; i++) {
    const viewportInfo = viewportsInfo[i];
    const { volumeInfo, toolGroupId } = viewportInfo;
    const { wadoRsRoot, StudyInstanceUID, SeriesInstanceUID, volumeId } =
      volumeInfo;
    const toolGroup = initializeToolGroup(toolGroupId);
    const imageIds = await getImageIds(
      wadoRsRoot,
      StudyInstanceUID,
      SeriesInstanceUID
    );

    toolGroupIds.add(toolGroupId);

    await initializeViewport(
      renderingEngine,
      toolGroup,
      viewportInfo,
      imageIds,
      volumeId
    );
  }

  await loadAndCacheAllParameterMaps();
  loadParameterMap(activeTransformName);
}

run();
