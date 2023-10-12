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

// This is for debugging purposes
console.warn(
  'Click on index.ts to open source code for this example --------->'
);

const pause = (interval) =>
  new Promise((resolve) => setTimeout(resolve, interval));

const { ViewportType } = Enums;
const renderingEngineId = 'myRenderingEngine';
const viewportId = 'CT_SAGITTAL_STACK';

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
let currentColormapName = colormaps[0].Name;
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
element.style.position = 'relative';
element.style.width = '500px';
element.style.height = '500px';

content.appendChild(element);

const bottomContainer = document.createElement('div');
const viewportTopContainer = document.createElement('div');
const viewportLeftContainer = document.createElement('div');
const viewportBottomContainer = document.createElement('div');
const viewportRightContainer = document.createElement('div');

content.appendChild(bottomContainer);

const containers = [
  bottomContainer,
  viewportTopContainer,
  viewportRightContainer,
  viewportBottomContainer,
  viewportLeftContainer,
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

const colorBar = new ColorBar({
  id: 'mainColorBar',
  colormaps,
  activeColormapName: currentColormapName,
  // voiRange: { min: 0.25, max: 0.75 },
  // orientation: ColorBarOrientation.Vertical,
});

const { rootNode } = colorBar;

rootNode.draggable = true;
rootNode.style.cursor = 'move';

Object.assign(viewportTopContainer.style, {
  position: 'absolute',
  top: '10px',
  left: 'calc(50% - 100px)',
  width: '200px',
  height: '30px',
});

Object.assign(viewportLeftContainer.style, {
  position: 'absolute',
  top: 'calc(50% - 100px)',
  left: '10px',
  width: '30px',
  height: '200px',
});

Object.assign(viewportBottomContainer.style, {
  position: 'absolute',
  top: 'calc(100% - 40px)',
  left: 'calc(50% - 100px)',
  width: '200px',
  height: '30px',
});

Object.assign(viewportRightContainer.style, {
  position: 'absolute',
  top: 'calc(50% - 100px)',
  left: 'calc(100% - 40px)',
  width: '30px',
  height: '200px',
});

Object.assign(bottomContainer.style, {
  width: '500px',
  height: '30px',
  marginTop: '10px',
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

  container.addEventListener('dragover', (evt) => evt.preventDefault());
  container.addEventListener('drop', (evt: DragEvent) => {
    const target = evt.target as HTMLElement;
    const currentParent = colorBar.rootNode.parentElement;

    // If the element is dropped into the same container
    // the `target` will be the canvas element
    const isContainer = containers.some((container) => container === target);

    if (!isContainer || currentParent === target) {
      return;
    }

    if (currentParent) {
      currentParent.style.border = 'solid 1px #eee';
    }

    colorBar.appendTo(target);
    evt.preventDefault();
  });

  containersMutationObserver.observe(container, { childList: true });
});

rootNode.addEventListener('dragstart', (evt) => {
  evt.dataTransfer.effectAllowed = 'move';
  containers.forEach((container) =>
    Object.assign(container.style, {
      display: 'block',
      backgroundColor: 'rgba(0, 255, 0, 0.2)',
    })
  );
});

rootNode.addEventListener('dragend', () => {
  containers.forEach(
    (container) => (container.style.backgroundColor = 'unset')
  );

  containers.forEach((container) =>
    Object.assign(container.style, {
      display: container.hasChildNodes() ? 'block' : 'none',
      backgroundColor: 'unset',
    })
  );
});

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
      renderingEngine.getViewport(viewportId)
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
      renderingEngine.getViewport(viewportId)
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
      renderingEngine.getViewport(viewportId)
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

      // Update colormap

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
      renderingEngine.getViewport(viewportId)
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
    defaultValue: currentColormapName,
  },
  style: {
    maxWidth: '100px',
  },
  onSelectedValueChange: (selectedValue) => {
    setColormap(<string>selectedValue);
  },
});

addSliderToToolbar({
  title: 'VOI min',
  range: [0, 1],
  step: 0.05,
  defaultValue: voiRangeMin,
  onSelectedValueChange: (value) => {
    voiRangeMin = parseFloat(value);
    colorBar.voiRange = { min: voiRangeMin, max: voiRangeMax };
  },
});

addSliderToToolbar({
  title: 'VOI max',
  range: [0, 1],
  step: 0.05,
  defaultValue: voiRangeMax,
  onSelectedValueChange: (value) => {
    voiRangeMax = parseFloat(value);
    colorBar.voiRange = { min: voiRangeMin, max: voiRangeMax };
  },
});

// ==[ Dev Tests ]==============================================================

async function testOrientations() {
  const setOrientation = async (orientation) => {
    console.log(`Orientation: ${orientation}`);
    colorBar.orientation = orientation;
    await pause(500);
  };

  await pause(500);
  await setOrientation(ColorBarOrientation.Vertical);
  await setOrientation(ColorBarOrientation.Horizontal);
  await setOrientation(ColorBarOrientation.Vertical);
  await setOrientation(ColorBarOrientation.Auto);
}

async function testVoiRange() {
  console.log('Testing VOI range');

  const numLoops = 4;
  const numMoves = 60;
  const pauseTime = 1000 / 60; // (1000 / fps)
  const windowWidth = 0.5;

  for (let numLoop = 0; numLoop < numLoops; numLoop++) {
    const leftToRight = !(numLoop % 2);
    const iStart = numLoop ? 1 : Math.floor(numMoves / 2);
    const iEnd = numLoop === numLoops - 1 ? Math.floor(numMoves / 2) : numMoves;

    for (let i = iStart; i < iEnd; i++) {
      const position = leftToRight ? i : numMoves - i - 1;
      const windowCenter = position * (1 / (numMoves - 1));
      const min = windowCenter - windowWidth / 2;
      const max = min + windowWidth;

      colorBar.voiRange = { min, max };

      await pause(pauseTime);
    }
  }

  // Restore voiRange to max
  colorBar.voiRange = { min: 0, max: 1 };
}

// Tests to make sure it works when resizing the container or attaching to a new container
async function testContainers() {
  await pause(500);

  console.log('appendTo(viewportTopContainer)');
  colorBar.appendTo(viewportTopContainer);

  await pause(500);

  console.log('update viewportTopContainer size');
  Object.assign(viewportTopContainer.style, {
    width: '400px',
    left: 'calc(50% - 200px)',
  });

  await pause(500);

  console.log('appendTo(viewportRightContainer)');
  colorBar.appendTo(viewportRightContainer);
  Object.assign(viewportTopContainer.style, {
    width: '200px',
    left: 'calc(50% - 100px)',
  });

  await pause(500);

  console.log('update viewportRightContainer size');
  Object.assign(viewportRightContainer.style, {
    height: '400px',
    top: 'calc(50% - 200px)',
  });

  await pause(500);

  console.log('appendTo(viewportBottomContainer)');
  colorBar.appendTo(viewportBottomContainer);
  Object.assign(viewportRightContainer.style, {
    height: '200px',
    top: 'calc(50% - 100px)',
  });

  await pause(500);

  console.log('update viewportBottomContainer size');
  Object.assign(viewportBottomContainer.style, {
    width: '400px',
    left: 'calc(50% - 200px)',
  });

  await pause(500);

  console.log('appendTo(viewportLeftContainer)');
  colorBar.appendTo(viewportLeftContainer);
  Object.assign(viewportBottomContainer.style, {
    width: '200px',
    left: 'calc(50% - 100px)',
  });

  await pause(500);

  console.log('update viewportLeftContainer size');
  Object.assign(viewportLeftContainer.style, {
    height: '400px',
    top: 'calc(50% - 200px)',
  });

  await pause(500);

  colorBar.appendTo(viewportBottomContainer);
  Object.assign(viewportLeftContainer.style, {
    height: '200px',
    top: 'calc(50% - 100px)',
  });
}

async function testColormaps() {
  for (let i = 1, len = colormaps.length; i < len; i++) {
    console.log(`Colormap: ${colormaps[i].Name}`);
    colorBar.activeColormapName = colormaps[i].Name;
    await pause(100);
  }

  // Back to the first colormap
  console.log(`Colormap: ${colormaps[0].Name}`);
  colorBar.activeColormapName = colormaps[0].Name;
}

async function runTests() {
  const currentParent = colorBar.rootNode?.parentElement;

  console.log('Dev tests started');

  await testContainers();

  // Add it back to its parent
  if (currentParent) {
    colorBar.appendTo(currentParent);
  }

  await testColormaps();
  await testOrientations();
  await testVoiRange();

  console.log('Dev tests complete');
}

// =============================================================================

function setColormap(colormapName: string) {
  currentColormapName = colormapName;
  colorBar.activeColormapName = colormapName;

  // Get the rendering engine
  const renderingEngine = getRenderingEngine(renderingEngineId);

  // Get the volume viewport
  const viewport = <Types.IVolumeViewport>(
    renderingEngine.getViewport(viewportId)
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
    viewportId,
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
    renderingEngine.getViewport(viewportId)
  );

  // Define a volume in memory
  const ctVolume = await volumeLoader.createAndCacheVolume(ctVolumeId, {
    imageIds: ctImageIds,
  });

  // Set the volume to load
  ctVolume.load();

  // Set the volume on the viewport
  viewport.setVolumes([
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
  element.appendChild(viewportTopContainer);
  element.appendChild(viewportRightContainer);
  element.appendChild(viewportBottomContainer);
  element.appendChild(viewportLeftContainer);

  colorBar.appendTo(viewportRightContainer);
}

run();
