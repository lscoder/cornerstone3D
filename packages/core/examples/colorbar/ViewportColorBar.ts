import {
  eventTarget,
  VolumeViewport,
  StackViewport,
  Types,
  Enums,
  utilities,
  getEnabledElement,
} from '@cornerstonejs/core';
import { ColorBar, ColorBarProps, ColorBarVOIRange } from './ColorBar';

const { Events } = Enums;

export interface ViewportColorBarProps extends ColorBarProps {
  element: HTMLDivElement;
  volumeId?: string;
  // viewportId: string;
  // renderingEngineId: string;
}

class ViewportColorBar extends ColorBar {
  private _element: HTMLDivElement;
  private _volumeId: string;
  // private _viewportId: string;
  // private _renderingEngineId: string;

  constructor(props: ViewportColorBarProps) {
    super({
      ...props,
      range: ViewportColorBar._getRange(props.element, props.volumeId),
      voiRange: ViewportColorBar._getVOIRange(props.element, props.volumeId),
    });

    // const range = this._getVOIRange(props.element);
    // console.log(range);

    this._element = props.element;
    this._volumeId = props.volumeId;
    // this._viewportId = viewportColorBarData.viewportId;
    // this._renderingEngineId = viewportColorBarData.renderingEngineId;

    this.init();
    this._addCornerstoneEventListener();
  }

  static _getRange(element, volumeId) {
    return { lower: -1000, upper: 1000 };

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const actor = volumeId
      ? viewport.getActor(volumeId)
      : viewport.getDefaultActor();

    if (!actor) {
      return { lower: -1000, upper: 1000 };
    }

    const imageData = actor.actor.getMapper().getInputData();
    const range = imageData.getPointData().getScalars().getRange();

    (window as any).actor = actor;
    console.log('>>>>> range :: ', range);

    return range[0] === 0 && range[1] === 0
      ? { lower: -1000, upper: 1000 }
      : { lower: range[0], upper: range[1] };
  }

  static _getVOIRange(element, volumeId) {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const actor = volumeId
      ? viewport.getActor(volumeId)
      : viewport.getDefaultActor();

    if (!actor) {
      return { lower: -1000, upper: 1000 };
    }

    const voiRange = actor.actor
      .getProperty()
      .getRGBTransferFunction(0)
      .getRange();

    // return { lower: -500, upper: 500 };
    return voiRange[0] === 0 && voiRange[1] === 0
      ? { lower: -1000, upper: 1000 }
      : { lower: voiRange[0], upper: voiRange[1] };
  }

  public get element() {
    return this._element;
  }

  public get enabledElement() {
    return getEnabledElement(this._element);
  }

  // public get viewportId() {
  //   return this.enabledElement.viewport.id;
  // }

  // public get renderingEngineId() {
  //   return this.enabledElement.viewport.renderingEngineId;
  // }

  protected init() {
    super.init();
    console.log('>>>>> init :: this', this);
    // this._addCornerstoneEventListener();
  }

  protected onVOIChanged(voiRange: ColorBarVOIRange) {
    super.onVOIChanged(voiRange);

    // const renderingEngine = getRenderingEngine(this._renderingEngineId);
    // const viewport = renderingEngine.getViewport(this._viewportId);
    const { viewport } = this.enabledElement;

    if (viewport instanceof StackViewport) {
      viewport.setProperties({
        voiRange: voiRange,
      });
      viewport.render();
    } else if (viewport instanceof VolumeViewport) {
      const { _volumeId: volumeId } = this;
      const viewportsContainingVolumeUID = utilities.getViewportsWithVolumeId(
        volumeId,
        viewport.renderingEngineId
      );

      viewport.setProperties({ voiRange });
      viewportsContainingVolumeUID.forEach((vp) => vp.render());
    }
  }

  // TEMPORARY
  // private _getVolumeId(viewport: Types.IViewport) {
  //   // If volume not specified, then return the actorUID for the
  //   // default actor - first actor
  //   const actorEntries = viewport.getActors();

  //   if (!actorEntries) {
  //     return;
  //   }

  //   // find the first image actor of instance type vtkVolume
  //   return actorEntries.find(
  //     (actorEntry) => actorEntry.actor.getClassName() === 'vtkVolume'
  //   )?.uid;
  // }

  private _imageVolumeModifiedCallback = (
    evt: Types.EventTypes.ImageVolumeModifiedEvent
  ) => {
    console.log('>>>>> imageVolumeModifiedCallback :: evt :: ', evt);
    const { volumeId } = evt.detail.imageVolume;

    if (volumeId !== this._volumeId) {
      return;
    }

    const { _element: element } = this;
    const range = ViewportColorBar._getRange(element, volumeId);
    // console.log('>>>>> imageVolumeModifiedCallback :: range: ', range);

    this.range = range;
  };

  private _viewportVOIModifiedCallback = (
    evt: Types.EventTypes.VoiModifiedEvent
  ) => {
    console.log('>>>>> viewportVOIModifiedCallback :: evt:', evt);
  };

  private _addCornerstoneEventListener() {
    const { _element: element } = this;

    eventTarget.addEventListener(
      Events.IMAGE_VOLUME_MODIFIED,
      this._imageVolumeModifiedCallback
    );

    element.addEventListener(
      Events.VOI_MODIFIED,
      this._viewportVOIModifiedCallback
    );
  }
}

export { ViewportColorBar as default, ViewportColorBar };
