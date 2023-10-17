import vtkColormaps from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction/ColorMaps';
import {
  RenderingEngine,
  Types,
  Enums,
  volumeLoader,
  getRenderingEngine,
} from '@cornerstonejs/core';
import {
  initDemo,
  createImageIdsAndCacheMetaData,
  setTitleAndDescription,
  addButtonToToolbar,
  addDropdownToToolbar,
  setCtTransferFunctionForVolumeActor,
  setPetColorMapTransferFunctionForVolumeActor,
  addSliderToToolbar,
} from '../../../../utils/demo/helpers';
import { ColorBar, ColorBarOrientation, Colormap } from './ColorBar';
import ViewportColorBar from './ViewportColorBar';

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const pause = (interval) =>
  new Promise((resolve) => setTimeout(resolve, interval));

const { ViewportType } = Enums;
const renderingEngineId = 'myRenderingEngine';
const stackViewportId = 'CT_STACK';
const volumeViewportId = 'CT_VOLUME_SAGITTAL';

// Define unique ids for the volumes
const volumeLoaderScheme = 'cornerstoneStreamingImageVolume'; // Loader id which defines which volume loader to use
const ctVolumeName = 'CT_VOLUME_ID'; // Id of the volume less loader prefix
const ctVolumeId = `${volumeLoaderScheme}:${ctVolumeName}`; // VolumeId with loader id + volume id

// Define a unique id for the volume
const ptVolumeName = 'PT_VOLUME_ID';
const ptVolumeId = `${volumeLoaderScheme}:${ptVolumeName}`;

const colormaps = vtkColormaps.rgbPresetNames.map(
  (presetName) => vtkColormaps.getPresetByName(presetName) as Colormap
);
let currentPTColormapName = 'Black-Body Radiation';
let voiRangeMin = 0;
let voiRangeMax = 1;

// ==[ Set up page ]============================================================

setTitleAndDescription(
  'Volume Viewport API With Multiple Volumes',
  'Demonstrates how to interact with a Volume viewport when using fusion.'
);

const content = document.getElementById('content');
const element = document.createElement('div');
element.id = 'cornerstone-element';

Object.assign(element.style, {
  position: 'relative',
  width: '500px',
  height: '500px',
  marginBottom: '30px',
});

content.appendChild(element);

const rightTopContainer = document.createElement('div');
const rightBottomContainer = document.createElement('div');
const bottomLeftContainer = document.createElement('div');
const bottomRightContainer = document.createElement('div');

const containers = [
  rightTopContainer,
  rightBottomContainer,
  bottomLeftContainer,
  bottomRightContainer,
];

const info = document.createElement('div');
content.appendChild(info);

const addInstruction = (instruction) => {
  const node = document.createElement('p');
  node.innerText = instruction;
  info.appendChild(node);
};

addInstruction('- Select different colormaps');
addInstruction('- Use the sliders to change the VOI min/max values');
addInstruction(
  `- The colobar can be moved to ${containers.length} different places`
);

const colorBarSize = { shortSide: 20, longSide: 250 };

// const ctColorBar = new ViewportColorBar({
//   id: 'ctColorBar',
//   viewportId: volumeViewportId,
//   renderingEngineId,
//   colormaps,
//   activeColormapName: 'Grayscale',
//   // voiRange: { min: 0.25, max: 0.75 },
//   // orientation: ColorBarOrientation.Vertical,
// });

// const ptColorBar = new ViewportColorBar({
//   id: 'ptColorBar',
//   viewportId: volumeViewportId,
//   renderingEngineId,
//   colormaps,
//   activeColormapName: currentPTColormapName,
//   // voiRange: { min: 0.25, max: 0.75 },
//   // orientation: ColorBarOrientation.Vertical,
// });

// const colorBars = [ctColorBar, ptColorBar */];

// ctColorBar.rootElement.draggable = true;
// ctColorBar.rootElement.style.cursor = 'move';

// ptColorBar.rootElement.draggable = true;
// ptColorBar.rootElement.style.cursor = 'move';

Object.assign(bottomLeftContainer.style, {
  position: 'absolute',
  top: '100%',
  left: '0px',
  width: `${colorBarSize.longSide}px`,
  height: `${colorBarSize.shortSide}px`,
});

Object.assign(bottomRightContainer.style, {
  position: 'absolute',
  top: '100%',
  left: '50%',
  width: `${colorBarSize.longSide}px`,
  height: `${colorBarSize.shortSide}px`,
});

Object.assign(rightTopContainer.style, {
  position: 'absolute',
  top: '0px',
  left: '100%',
  width: `${colorBarSize.shortSide}px`,
  height: `${colorBarSize.longSide}px`,
});

Object.assign(rightBottomContainer.style, {
  position: 'absolute',
  top: '50%',
  left: '100%',
  width: `${colorBarSize.shortSide}px`,
  height: `${colorBarSize.longSide}px`,
});

// Change the container style when it has/hasn't a colorbar attached to it
const containersMutationObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    const container = mutation.target as HTMLElement;
    const hasChildNodes = container.hasChildNodes();

    Object.assign(container.style, {
      display: hasChildNodes ? 'block' : 'none',
      border: hasChildNodes ? 'solid 1px #555' : 'none',
    });
  });
});

containers.forEach((container) => {
  const hasChildNodes = container.hasChildNodes();

  Object.assign(container.style, {
    boxSizing: 'border-box',
    display: hasChildNodes ? 'block' : 'none',
  });

  // container.addEventListener('dragover', (evt) => evt.preventDefault());
  // container.addEventListener('drop', (evt: DragEvent) => {
  //   const target = evt.target as HTMLElement;
  //   const rawTransferedData = evt.dataTransfer.getData('application/json');
  //   const transferedData = JSON.parse(rawTransferedData);
  //   const colorBar = colorBars.find(
  //     (colorBar) => colorBar.id === transferedData.colorBarId
  //   );
  //   const sourceContainer = colorBar.rootElement.parentElement;
  //   const containersSet = new Set<HTMLElement>(containers);
  //   let targetContainer = null;

  //   // If the element is dropped into the same container the `target` will be the
  //   // canvas element and we need to search for some parent element that is a container

  //   for (let node = target; node !== null; node = node.parentElement) {
  //     if (containersSet.has(node)) {
  //       targetContainer = node;
  //       break;
  //     }
  //   }

  //   if (!targetContainer) {
  //     return;
  //   }

  //   const swapColorBars = targetContainer.hasChildNodes();

  //   colorBar.appendTo(targetContainer);

  //   if (swapColorBars) {
  //     const otherColorBar = colorBars.find(
  //       (colorBar) => colorBar.id !== transferedData.colorBarId
  //     );
  //     otherColorBar.appendTo(sourceContainer);
  //   }

  //   evt.preventDefault();
  // });

  containersMutationObserver.observe(container, { childList: true });
});

// colorBars.forEach((colorBar) => {
//   colorBar.rootElement.addEventListener('dragstart', (evt) => {
//     evt.dataTransfer.effectAllowed = 'move';
//     evt.dataTransfer.setData(
//       'application/json',
//       JSON.stringify({
//         colorBarId: colorBar.id,
//       })
//     );

//     containers.forEach((container) =>
//       Object.assign(container.style, {
//         display: 'block',
//         backgroundColor: 'rgba(0, 255, 0, 0.2)',
//       })
//     );
//   });

//   colorBar.rootElement.addEventListener('dragend', () => {
//     containers.forEach(
//       (container) => (container.style.backgroundColor = 'none')
//     );

//     containers.forEach((container) =>
//       Object.assign(container.style, {
//         display: container.hasChildNodes() ? 'block' : 'none',
//         backgroundColor: 'none',
//       })
//     );
//   });
// });

const runTestsButton = document.createElement('button');

runTestsButton.style.marginTop = '20px';
runTestsButton.textContent = 'Run dev tests';
runTestsButton.addEventListener('click', () => runTests());
content.appendChild(runTestsButton);

// ==[ Toolbar ]================================================================

addButtonToToolbar({
  title: 'Set CT VOI Range',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the stack viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(volumeViewportId)
    );

    viewport.setProperties({ voiRange: { lower: -1500, upper: 2500 } });
    viewport.render();
  },
});

addButtonToToolbar({
  title: 'Reset Viewport',
  onClick: () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(volumeViewportId)
    );

    // Resets the viewport's camera
    viewport.resetCamera();
    // TODO reset the viewport properties, we don't have API for this.

    viewport.render();
  },
});

let fused = false;

addButtonToToolbar({
  title: 'toggle PET',
  onClick: async () => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(volumeViewportId)
    );
    if (fused) {
      // Removes the PT actor from the scene
      viewport.removeVolumeActors([ptVolumeId], true);

      fused = false;
    } else {
      // Add the PET volume to the viewport. It is in the same DICOM Frame Of Reference/worldspace
      // If it was in a different frame of reference, you would need to register it first.
      await viewport.addVolumes(
        [
          {
            volumeId: ptVolumeId,
            callback: setPetColorMapTransferFunctionForVolumeActor,
          },
        ],
        true
      );

      setPTColormap(currentPTColormapName);
      fused = true;
    }
  },
});

const orientationOptions = {
  axial: 'axial',
  sagittal: 'sagittal',
  coronal: 'coronal',
  oblique: 'oblique',
};

addDropdownToToolbar({
  options: {
    values: ['axial', 'sagittal', 'coronal', 'oblique'],
    defaultValue: 'sagittal',
  },
  onSelectedValueChange: (selectedValue) => {
    // Get the rendering engine
    const renderingEngine = getRenderingEngine(renderingEngineId);

    // Get the volume viewport
    const viewport = <Types.IVolumeViewport>(
      renderingEngine.getViewport(volumeViewportId)
    );

    let viewUp;
    let viewPlaneNormal;

    switch (selectedValue) {
      case orientationOptions.axial:
        viewport.setOrientation(Enums.OrientationAxis.AXIAL);

        break;
      case orientationOptions.sagittal:
        viewport.setOrientation(Enums.OrientationAxis.SAGITTAL);

        break;
      case orientationOptions.coronal:
        viewport.setOrientation(Enums.OrientationAxis.CORONAL);

        break;
      case orientationOptions.oblique:
        // Some random oblique value for this dataset
        viewUp = [-0.5962687530844388, 0.5453181550345819, -0.5891448751239446];
        viewPlaneNormal = [
          -0.5962687530844388, 0.5453181550345819, -0.5891448751239446,
        ];

        viewport.setCamera({ viewUp, viewPlaneNormal });
        viewport.resetCamera();
        break;
    }

    viewport.render();
  },
});

addDropdownToToolbar({
  options: {
    values: colormaps.map((cm) => cm.Name),
    defaultValue: currentPTColormapName,
  },
  style: {
    maxWidth: '100px',
  },
  onSelectedValueChange: (selectedValue) => {
    setPTColormap(<string>selectedValue);
  },
});

addSliderToToolbar({
  title: 'VOI min',
  range: [0, 1],
  step: 0.05,
  defaultValue: voiRangeMin,
  onSelectedValueChange: (value) => {
    voiRangeMin = parseFloat(value);
    // ptColorBar.voiRange = { min: voiRangeMin, max: voiRangeMax };
  },
});

addSliderToToolbar({
  title: 'VOI max',
  range: [0, 1],
  step: 0.05,
  defaultValue: voiRangeMax,
  onSelectedValueChange: (value) => {
    voiRangeMax = parseFloat(value);
    // ptColorBar.voiRange = { min: voiRangeMin, max: voiRangeMax };
  },
});

// ==[ Dev Tests ]==============================================================

// async function testOrientations() {
//   const setOrientation = async (orientation) => {
//     console.log(`Orientation: ${orientation}`);
//     ptColorBar.orientation = orientation;
//     await pause(500);
//   };

//   await pause(500);
//   await setOrientation(ColorBarOrientation.Vertical);
//   await setOrientation(ColorBarOrientation.Horizontal);
//   await setOrientation(ColorBarOrientation.Vertical);
//   await setOrientation(ColorBarOrientation.Auto);
// }

// async function testVoiRange() {
//   console.log('Testing VOI range');

//   const numLoops = 4;
//   const numMoves = 60;
//   const pauseTime = 1000 / 60; // (1000 / fps)
//   const windowWidth = 0.5;

//   for (let numLoop = 0; numLoop < numLoops; numLoop++) {
//     const leftToRight = !(numLoop % 2);
//     const iStart = numLoop ? 1 : Math.floor(numMoves / 2);
//     const iEnd = numLoop === numLoops - 1 ? Math.floor(numMoves / 2) : numMoves;

//     for (let i = iStart; i < iEnd; i++) {
//       const position = leftToRight ? i : numMoves - i - 1;
//       const windowCenter = position * (1 / (numMoves - 1));
//       const min = windowCenter - windowWidth / 2;
//       const max = min + windowWidth;

//       ptColorBar.voiRange = { min, max };

//       await pause(pauseTime);
//     }
//   }

//   // Restore voiRange to max
//   ptColorBar.voiRange = { min: 0, max: 1 };
// }

// // Tests to make sure it works when resizing the container or attaching to a new container
// async function testContainers() {
//   await pause(500);

//   console.log('append to right containers');
//   ctColorBar.appendTo(rightTopContainer);
//   ptColorBar.appendTo(rightBottomContainer);

//   await pause(500);

//   console.log('update right containers size');
//   Object.assign(rightTopContainer.style, {
//     height: `${colorBarSize.longSide - 100}px`,
//   });
//   Object.assign(rightBottomContainer.style, {
//     height: `${colorBarSize.longSide - 100}px`,
//   });

//   await pause(500);

//   console.log('append to bottom containers');
//   ctColorBar.appendTo(bottomLeftContainer);
//   ptColorBar.appendTo(bottomRightContainer);

//   // Restore right containers size
//   Object.assign(rightTopContainer.style, {
//     height: `${colorBarSize.longSide}px`,
//   });
//   Object.assign(rightBottomContainer.style, {
//     height: `${colorBarSize.longSide}px`,
//   });

//   await pause(500);

//   console.log('update bottom containers size');
//   Object.assign(bottomLeftContainer.style, {
//     width: `${colorBarSize.longSide - 100}px`,
//   });
//   Object.assign(bottomRightContainer.style, {
//     width: `${colorBarSize.longSide - 100}px`,
//   });

//   await pause(500);

//   // Restore bottom containers size
//   Object.assign(bottomLeftContainer.style, {
//     width: `${colorBarSize.longSide}px`,
//   });
//   Object.assign(bottomRightContainer.style, {
//     width: `${colorBarSize.longSide}px`,
//   });
// }

// async function testPTColormaps() {
//   for (let i = 1, len = colormaps.length; i < len; i++) {
//     console.log(`Colormap: ${colormaps[i].Name}`);
//     ptColorBar.activeColormapName = colormaps[i].Name;
//     await pause(100);
//   }

//   // Back to the first colormap
//   console.log(`Colormap: ${colormaps[0].Name}`);
//   ptColorBar.activeColormapName = colormaps[0].Name;
// }

async function runTests() {
  // const currentCTParent = ctColorBar.rootElement.parentElement;
  // const currentPTParent = ptColorBar.rootElement.parentElement;
  // console.log('Dev tests started');
  // await testContainers();
  // // Add them back to theirs parents
  // ctColorBar.appendTo(currentCTParent);
  // ptColorBar.appendTo(currentPTParent);
  // await testPTColormaps();
  // await testOrientations();
  // await testVoiRange();
  // console.log('Dev tests complete');
}

// =============================================================================

function setPTColormap(colormapName: string) {
  currentPTColormapName = colormapName;
  // ptColorBar.activeColormapName = colormapName;

  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId);

  // Get the volume viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(volumeViewportId)
  );

  viewport.setProperties({ colormap: { name: colormapName } }, ptVolumeId);
  viewport.render();
}

/**
 * Runs the demo
 */
async function run() {
  // Init Cornerstone and related libraries
  await initDemo();

  const wadoRsRoot = 'https://d3t6nz73ql33tx.cloudfront.net/dicomweb';
  const StudyInstanceUID =
    '1.3.6.1.4.1.14519.5.2.1.7009.2403.334240657131972136850343327463';

  // Get Cornerstone imageIds and fetch metadata into RAM
  const ctImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.226151125820845824875394858561',
    wadoRsRoot,
  });

  const ptImageIds = await createImageIdsAndCacheMetaData({
    StudyInstanceUID,
    SeriesInstanceUID:
      '1.3.6.1.4.1.14519.5.2.1.7009.2403.879445243400782656317561081015',
    wadoRsRoot,
  });

  // Instantiate a rendering engine
  const renderingEngine = new RenderingEngine(renderingEngineId);

  // Create a stack viewport
  const viewportInput = {
    viewportId: volumeViewportId,
    type: ViewportType.ORTHOGRAPHIC,
    element,
    defaultOptions: {
      orientation: Enums.OrientationAxis.SAGITTAL,
      background: <Types.Point3>[0.2, 0, 0.2],
    },
  };

  renderingEngine.enableElement(viewportInput);

  // Get the stack viewport that was created
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(volumeViewportId)
  );

  // Define a volume in memory
  const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
    imageIds: ctImageIds,
  });

  // Set the volume to load
  ctVolume.load();

  // Set the volume on the viewport
  await viewport.setVolumes([
    { volumeId: ctVolumeId, callback: setCtTransferFunctionForVolumeActor },
  ]);

  // Render the image
  renderingEngine.render();

  // Load the PT in the background as we know we'll need it

  // Define a volume in memory
  const ptVolume = await volumeLoader.createAndCacheVolume(ptVolumeId, {
    imageIds: ptImageIds,
  });

  // Set the volume to load
  ptVolume.load();

  // Append the containers after initializing the viewport to keep them over
  // all other viewport elements
  element.appendChild(rightTopContainer);
  element.appendChild(rightBottomContainer);
  element.appendChild(bottomLeftContainer);
  element.appendChild(bottomRightContainer);

  const ctColorBar = new ViewportColorBar({
    id: 'ctColorBar',
    element,
    volumeId: ctVolumeId,
    // viewportId: volumeViewportId,
    // renderingEngineId,
    // range: { lower: -2000, upper: 2000 },
    // voiRange: { lower: -600, upper: 0 },
    colormaps,
    activeColormapName: 'Grayscale',
    // voiRange: { min: 0.25, max: 0.75 },
    // orientation: ColorBarOrientation.Vertical,
  });

  ctColorBar.appendTo(rightTopContainer);
  // ptColorBar.appendTo(rightBottomContainer);
}

run();
