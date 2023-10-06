import type { Types } from '@cornerstonejs/core';
import {
  AdvancedMagnifyViewport,
  AutoPanCallback,
} from './AdvancedMagnifyViewport';

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
    magnifyViewportId,
    sourceEnabledElement,
    position,
    radius,
    zoomFactor,
    autoPan,
  }: {
    magnifyViewportId?: string;
    sourceEnabledElement: Types.IEnabledElement;
    position: Types.Point2;
    radius: number;
    zoomFactor: number;
    autoPan: {
      enabled: boolean;
      padding: number;
      callback: AutoPanCallback;
    };
  }): AdvancedMagnifyViewport => {
    const magnifyViewport = new AdvancedMagnifyViewport({
      magnifyViewportId,
      sourceEnabledElement,
      radius,
      position,
      zoomFactor,
      autoPan,
    });

    this._viewports.set(magnifyViewport.viewportId, magnifyViewport);

    return magnifyViewport;
  };

  public getViewport(magnifyViewportId: string): AdvancedMagnifyViewport {
    return this._viewports.get(magnifyViewportId);
  }

  public destroyViewport(magnifyViewportId: string): void {
    const magnifyViewport = this._viewports.get(magnifyViewportId);

    magnifyViewport.dispose();
    this._viewports.delete(magnifyViewportId);
  }
}

export {
  AdvancedMagnifyViewportManager as default,
  AdvancedMagnifyViewportManager,
};
