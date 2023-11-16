import { CubicSpline } from './CubicSpline';

// enum BezierTangentType {
//   Broken = 'broken',
//   Aligned = 'aligned',
//   Mirroed = 'mirroed'
// };

const TRANSFORM_MATRIX = [1, 0, 0, 0, -3, 3, 0, 0, 3, -6, 3, 0, -1, 3, -3, 1];

class CubicBezier extends CubicSpline {
  // constructor(props: SplineProps) {
  //   super(props);
  // }

  // public addKnot(x: number, y: number) {
  // }

  // public removeKnot(index: number) {
  // }

  protected getTransformMatrix(): number[] {
    return TRANSFORM_MATRIX;
  }
}

export { CubicBezier as default, CubicBezier };
