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
} from '../../../../utils/demo/helpers';
import { ColorBar, ColorBarOrientation } from './ColorBar';
import colormaps from './colormaps';

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

// ======== Set up page ======== //
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

const colorBar = new ColorBar({
  id: 'mainColorBar',
  colormaps,
  // voiRange: { min: 0.25, max: 0.75 },
  // orientation: ColorBarOrientation.Vertical,
});

const { rootNode } = colorBar;

rootNode.draggable = true;
rootNode.style.cursor = 'move';

const outsideBottomContainer = document.createElement('div');
const insideTopContainer = document.createElement('div');
const insideLeftContainer = document.createElement('div');
const insideBottomContainer = document.createElement('div');
const insideRightContainer = document.createElement('div');

const containers = [
  outsideBottomContainer,
  insideTopContainer,
  insideRightContainer,
  insideBottomContainer,
  insideLeftContainer,
];

Object.assign(insideTopContainer.style, {
  position: 'absolute',
  top: '10px',
  left: 'calc(50% - 100px)',
  width: '200px',
  height: '30px',
});

Object.assign(insideLeftContainer.style, {
  position: 'absolute',
  top: 'calc(50% - 100px)',
  left: '10px',
  width: '30px',
  height: '200px',
});

Object.assign(insideBottomContainer.style, {
  position: 'absolute',
  top: 'calc(100% - 40px)',
  left: 'calc(50% - 100px)',
  width: '200px',
  height: '30px',
});

Object.assign(insideRightContainer.style, {
  position: 'absolute',
  top: 'calc(50% - 100px)',
  left: 'calc(100% - 40px)',
  width: '30px',
  height: '200px',
});

Object.assign(outsideBottomContainer.style, {
  position: 'absolute',
  top: 'calc(100% + 10px)',
  left: '0px',
  width: '100%',
  height: '30px',
});

// Change the container style when it has/hasn't a colorbar attached to it
const containersMutationObserver = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    const container = mutation.target as HTMLElement;
    container.style.border = container.hasChildNodes()
      ? 'solid 1px #555'
      : 'none';
  });
});

containers.forEach((container) => {
  container.addEventListener('dragover', (evt) => evt.preventDefault());
  container.addEventListener('drop', (evt: DragEvent) => {
    const target = evt.target as HTMLElement;
    const currentParent = colorBar.rootNode.parentElement;

    evt.preventDefault();

    if (currentParent) {
      currentParent.style.border = 'solid 1px #eee';
    }

    colorBar.appendTo(target);
  });

  containersMutationObserver.observe(container, { childList: true });
});

rootNode.addEventListener('dragstart', (evt) => {
  evt.dataTransfer.effectAllowed = 'move';
  containers.forEach(
    (container) => (container.style.backgroundColor = 'rgba(0, 255, 0, 0.2)')
  );
});

rootNode.addEventListener('dragend', () => {
  containers.forEach(
    (container) => (container.style.backgroundColor = 'unset')
  );
});

// ============================= //

// Buttons
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
  onClick: () => {
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
      viewport.addVolumes(
        [
          {
            volumeId: ptVolumeId,
            callback: setPetColorMapTransferFunctionForVolumeActor,
          },
        ],
        true
      );

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

// Tests to make sure it works when resizing the container or attaching to a new container
async function testPositions() {
  await pause(500);

  console.log('>>>>> appendTo(insideTopContainer)');
  colorBar.appendTo(insideTopContainer);

  await pause(500);

  console.log('>>>>> update insideTopContainer size');
  Object.assign(insideTopContainer.style, {
    width: '400px',
    left: 'calc(50% - 200px)',
  });

  await pause(500);

  console.log('>>>>> appendTo(insideRightContainer)');
  colorBar.appendTo(insideRightContainer);
  Object.assign(insideTopContainer.style, {
    width: '200px',
    left: 'calc(50% - 100px)',
  });

  await pause(500);

  console.log('>>>>> update insideRightContainer size');
  Object.assign(insideRightContainer.style, {
    height: '400px',
    top: 'calc(50% - 200px)',
  });

  await pause(500);

  console.log('>>>>> appendTo(insideBottomContainer)');
  colorBar.appendTo(insideBottomContainer);
  Object.assign(insideRightContainer.style, {
    height: '200px',
    top: 'calc(50% - 100px)',
  });

  await pause(500);

  console.log('>>>>> update insideBottomContainer size');
  Object.assign(insideBottomContainer.style, {
    width: '400px',
    left: 'calc(50% - 200px)',
  });

  await pause(500);

  console.log('>>>>> appendTo(insideLeftContainer)');
  colorBar.appendTo(insideLeftContainer);
  Object.assign(insideBottomContainer.style, {
    width: '200px',
    left: 'calc(50% - 100px)',
  });

  await pause(500);

  console.log('>>>>> update insideLeftContainer size');
  Object.assign(insideLeftContainer.style, {
    height: '400px',
    top: 'calc(50% - 200px)',
  });

  await pause(500);

  colorBar.appendTo(insideBottomContainer);
  Object.assign(insideLeftContainer.style, {
    height: '200px',
    top: 'calc(50% - 100px)',
  });
}

async function testColorMaps() {
  for (let i = 1, len = colormaps.length; i < len; i++) {
    console.log(colormaps[i].Name);
    colorBar.activeColormapName = colormaps[i].Name;
    await pause(500);
  }

  // Back to the first colormap
  console.log(colormaps[0].Name);
  colorBar.activeColormapName = colormaps[0].Name;
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
  element.appendChild(insideTopContainer);
  element.appendChild(insideRightContainer);
  element.appendChild(insideBottomContainer);
  element.appendChild(insideLeftContainer);
  element.appendChild(outsideBottomContainer);

  await testPositions();
  colorBar.appendTo(outsideBottomContainer);
  await testColorMaps();
}

run();
