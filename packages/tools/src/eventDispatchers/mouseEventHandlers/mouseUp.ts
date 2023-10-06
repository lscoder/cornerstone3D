import customCallbackHandler from '../shared/customCallbackHandler';
import handleMagnifyingGlassSomething from '../shared/handleMagnifyingGlassSomething';

/**
 * mouseClick - Event handler for mouse up events. Uses `customCallbackHandler` to fire
 * the `mouseUpCallback` function on active tools.
 */
const callbackHandler = customCallbackHandler.bind(
  null,
  'Mouse',
  'mouseUpCallback'
);

function mouseUp(evt: any) {
  callbackHandler(evt);

  // console.log('>>>>> MG :: Removing event listener');
  // document.removeEventListener(
  //   'MAGNIFYING_GLASS_SOMETHING',
  //   handleMagnifyingGlassSomething
  // );
}

export default mouseUp;
