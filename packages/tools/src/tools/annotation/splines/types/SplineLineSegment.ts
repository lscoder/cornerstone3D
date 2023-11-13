import type { AABB } from './AABB';
import type { Point2 } from './Point2';

export type SplineLineSegment = {
  points: {
    start: Point2;
    end: Point2;
  };
  aabb: AABB;
  length: number;
};
