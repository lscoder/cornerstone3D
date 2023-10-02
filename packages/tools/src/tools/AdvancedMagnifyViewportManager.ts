import AdvancedMagnifyViewport from './AdvancedMagnifyViewport';

const singletonSymbol = Symbol('AdvancedMagnifyViewportManager');

class AdvancedMagnifyViewportManager {
  private _viewports: Map<string, AdvancedMagnifyViewport>;

  constructor() {
    this._viewports = new Map();
  }

  public static getInstance(): AdvancedMagnifyViewportManager {
    AdvancedMagnifyViewportManager[singletonSymbol] =
      AdvancedMagnifyViewportManager[singletonSymbol] ??
      new AdvancedMagnifyViewportManager();

    return AdvancedMagnifyViewportManager[singletonSymbol];
  }

  public createViewport = ({
    parentEnabledElement,
    referencedImageId,
    position,
    radius,
  }): {
    magnifyViewportId: string;
  } => {
    const magnifyViewport = new AdvancedMagnifyViewport({
      parentEnabledElement,
      referencedImageId,
      radius,
      position,
    });

    const { viewportId: magnifyViewportId } = magnifyViewport;
    this._viewports.set(magnifyViewportId, magnifyViewport);

    return { magnifyViewportId };
  };

  public getViewport(magnifyViewportId: string): AdvancedMagnifyViewport {
    return this._viewports.get(magnifyViewportId);
  }

  public destroyViewport(magnifyViewportId: string): void {
    const magnifyViewport = this._viewports.get(magnifyViewportId);

    magnifyViewport.destroy();
    this._viewports.delete(magnifyViewportId);
  }
}

export {
  AdvancedMagnifyViewportManager as default,
  AdvancedMagnifyViewportManager,
};
