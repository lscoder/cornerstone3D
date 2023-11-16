import { mat3 } from 'gl-matrix';
import { Spline } from './Spline';
import type { Point2 } from '../math/types/Point2';
import type { SplineProps } from './types/SplineProps';
import type { AABB } from '../math/types/AABB';
import type { SplineLineSegment } from './types/SplineLineSegment';
import type { SplineCurveSegment } from './types/SplineCurveSegment';

abstract class QuadraticSpline extends Spline {
  protected getSplineCurves(): SplineCurveSegment[] {
    console.warn('TODO: getSplineCurves');
    return [];
  }

  protected getLineSegments(): SplineLineSegment[] {
    console.warn('TODO: getLineSegments');
    return [];
  }

  private _getTransformMatrixDerivative(transformMatrix: mat3) {
    console.warn('TODO: getTransformMatrixDerivative');
  }
}

export { QuadraticSpline as default, QuadraticSpline };
