import type { AABB } from '../../math/types/AABB';
import type { Point2 } from '../../math/types/Point2';

export type SplineLineSegment = {
  points: {
    start: Point2;
    end: Point2;
  };
  aabb: AABB;
  length: number;
  lengthStart: number;
};
