import type { Point2 } from './types/Point2';
import type { ISpline } from './types/ISpline';
import type { SplineProps } from './types/SplineProps';
import type { AABB } from './types/AABB';
import type { SplineCurveSegment } from './types/SplineCurveSegment';
import type { ClosestControlPoint } from './types/ClosestControlPoint';

/**
 * Spline curve representation
 *
 * You can find more about splines in this video
 * https://www.youtube.com/watch?v=jvPPXbo87ds&t=11m20s
 */
abstract class Spline implements ISpline {
  private _controlPoints: Point2[] = [];
  private _resolution: number;
  private _closed: boolean;
  private _invalidated = false;
  private _curveSegments: SplineCurveSegment[];
  private _aabb: AABB;
  private _length = 0;

  constructor(props?: SplineProps) {
    this._controlPoints = [];
    this._resolution = props?.resolution ?? 20;
    this._closed = props?.closed ?? false;
    this._invalidated = true;
  }

  /**
   * Return the control points array
   *
   * Any external access should be done through getControlPoints because it
   * clones the points to make sure the data will not get changed by the caller
   */
  protected get controlPoints(): Point2[] {
    return this._controlPoints;
  }

  public get numControlPoints(): number {
    return this._controlPoints.length;
  }

  public get resolution(): number {
    return this._resolution;
  }

  public set resolution(resolution: number) {
    if (this._resolution === resolution) {
      return;
    }

    this._resolution = resolution;
    this.invalidated = true;
  }

  public get closed(): boolean {
    return this._closed;
  }

  public set closed(closed: boolean) {
    if (this._closed === closed) {
      return;
    }

    this._closed = closed;
    this.invalidated = true;
  }

  public get curveSegments(): SplineCurveSegment[] {
    this._update();
    return this._curveSegments;
  }

  public get aabb(): AABB {
    this._update();
    return this._aabb;
  }

  public get length(): number {
    this._update();
    return this._length;
  }

  public get invalidated(): boolean {
    return this._invalidated;
  }

  protected set invalidated(invalidated: boolean) {
    this._invalidated = invalidated;
  }

  public hasTangentPoints() {
    return false;
  }

  public addControlPoint(x: number, y: number): void {
    this._controlPoints.push([x, y]);
    this.invalidated = true;
  }

  public addControlPoints(points: Point2[]): void {
    points.forEach((point) => this.addControlPoint(point[0], point[1]));
  }

  public updateControlPoint(index: number, x: number, y: number): void {
    if (index < 0 || index >= this._controlPoints.length) {
      throw new Error('Index out of bounds');
    }

    this._controlPoints[index] = [x, y];
    this.invalidated = true;
  }

  public getControlPoints(): Point2[] {
    return this._controlPoints.map((controlPoint) => [
      controlPoint[0],
      controlPoint[1],
    ]);
  }

  public getClosestControlPoint(x: number, y: number): ClosestControlPoint {
    const points = this._controlPoints;
    let minSquaredDist = Infinity;
    let closestPointIndex = -1;

    for (let i = 0, len = points.length; i < len; i++) {
      const point = points[i];
      const dx = x - point[0];
      const dy = y - point[1];
      const squaredDist = dx * dx + dy * dy;

      if (squaredDist < minSquaredDist) {
        minSquaredDist = squaredDist;
        closestPointIndex = i;
      }
    }

    return {
      index: closestPointIndex,
      point: closestPointIndex === -1 ? undefined : [x, y],
      distance: Math.sqrt(minSquaredDist),
    };
  }

  public getClosestControlPointWithinRange(
    x: number,
    y: number,
    range: number
  ): ClosestControlPoint {
    const closestControlPoint = this.getClosestControlPoint(x, y);
    return closestControlPoint.distance <= range
      ? closestControlPoint
      : undefined;
  }

  public getPolylinePoints(): Point2[] {
    this._update();

    const { _curveSegments: curveSegments } = this;
    const polylinePoints2: Point2[] = [];

    for (
      let i = 0, numCurveSegs = curveSegments.length;
      i < numCurveSegs;
      i++
    ) {
      const { lineSegments } = curveSegments[i];

      for (let j = 0, numLineSegs = lineSegments.length; j < numLineSegs; j++) {
        const lineSegment = lineSegments[j];

        // Add the start point before adding all end points
        if (i === 0 && j === 0) {
          polylinePoints2.push([...lineSegment.points.start]);
        }

        // Always add 1 because the first segment stored its start point at the first position
        polylinePoints2.push([...lineSegment.points.end]);
      }
    }

    return polylinePoints2;
  }

  public containsPoint(x: number, y: number): boolean {
    console.warn('TODO: containsPoint');
    return false;
  }

  protected abstract getTransformMatrix(): number[];

  protected abstract getSplineCurves(): SplineCurveSegment[];

  private _update() {
    if (!this._invalidated) {
      return;
    }

    const curveSegments = this.getSplineCurves();
    let length = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    curveSegments.forEach((curveSegment) => {
      const { aabb: curveSegAABB } = curveSegment;

      minX = minX <= curveSegAABB.minX ? minX : curveSegAABB.minX;
      minY = minY <= curveSegAABB.minY ? minY : curveSegAABB.minY;
      maxX = maxX >= curveSegAABB.maxX ? maxX : curveSegAABB.maxX;
      maxY = maxY >= curveSegAABB.maxY ? maxY : curveSegAABB.maxY;
      length += curveSegment.length;
    });

    this._curveSegments = curveSegments;
    this._aabb = { minX, minY, maxX, maxY };
    this._length = length;
    this._invalidated = false;
  }
}

export { Spline as default, Spline };
