import type { AABB } from './AABB';
import type { Point2 } from './Point2';
import type { SplineLineSegment } from './SplineLineSegment';

export type SplineCurveSegment = {
  controlPoints: {
    p0: Point2;
    p1: Point2;
    p2: Point2;
    p3: Point2;
  };
  aabb: AABB;
  length: number;
  lineSegments: SplineLineSegment[];
};
