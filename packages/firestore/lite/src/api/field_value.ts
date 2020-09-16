/**
 * @license
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { validateAtLeastNumberOfArgs } from '../../../src/util/input_validation';
import {
  ArrayRemoveFieldValueImpl,
  ArrayUnionFieldValueImpl,
  DeleteFieldValueImpl,
  NumericIncrementFieldValueImpl,
  _SerializableFieldValue,
  ServerTimestampFieldValueImpl
} from '../../../src/api/field_value';
import { ParseContext } from '../../../src/api/user_data_reader';
import { FieldTransform } from '../../../src/model/mutation';

/**
 * Sentinel values that can be used when writing document fields with `set()`
 * or `update()`.
 */
export abstract class FieldValue extends _SerializableFieldValue {}

/**
 * A delegate class that allows the FieldValue implementations returned by
 * deleteField(), serverTimestamp(), arrayUnion(), arrayRemove() and
 * increment() to be an instance of the lite FieldValue class declared above.
 *
 * We don't directly subclass `FieldValue` in the various field value
 * implementations as the base FieldValue class differs between the lite, full
 * and legacy SDK.
 */
class FieldValueDelegate extends FieldValue {
  readonly _methodName: string;

  constructor(readonly _delegate: _SerializableFieldValue) {
    super();
    this._methodName = _delegate._methodName;
  }

  _toFieldTransform(context: ParseContext): FieldTransform | null {
    return this._delegate._toFieldTransform(context);
  }

  isEqual(other: FieldValue): boolean {
    if (!(other instanceof FieldValueDelegate)) {
      return false;
    }
    return this._delegate.isEqual(other._delegate);
  }
}

/**
 * Returns a sentinel for use with `update()` to mark a field for deletion.
 */
export function deleteField(): FieldValue {
  return new FieldValueDelegate(new DeleteFieldValueImpl('deleteField'));
}

/**
 * Returns a sentinel used with `set()` or `update()` to include a
 * server-generated timestamp in the written data.
 */
export function serverTimestamp(): FieldValue {
  return new FieldValueDelegate(
    new ServerTimestampFieldValueImpl('serverTimestamp')
  );
}

/**
 * Returns a special value that can be used with `set()` or `update()` that tells
 * the server to union the given elements with any array value that already
 * exists on the server. Each specified element that doesn't already exist in
 * the array will be added to the end. If the field being modified is not
 * already an array it will be overwritten with an array containing exactly
 * the specified elements.
 *
 * @param elements The elements to union into the array.
 * @return The FieldValue sentinel for use in a call to `set()` or `update()`.
 */
export function arrayUnion(...elements: unknown[]): FieldValue {
  validateAtLeastNumberOfArgs('arrayUnion()', arguments, 1);
  // NOTE: We don't actually parse the data until it's used in set() or
  // update() since we'd need the Firestore instance to do this.
  return new FieldValueDelegate(
    new ArrayUnionFieldValueImpl('arrayUnion', elements)
  );
}

/**
 * Returns a special value that can be used with `set()` or `update()` that tells
 * the server to remove the given elements from any array value that already
 * exists on the server. All instances of each element specified will be
 * removed from the array. If the field being modified is not already an
 * array it will be overwritten with an empty array.
 *
 * @param elements The elements to remove from the array.
 * @return The FieldValue sentinel for use in a call to `set()` or `update()`.
 */
export function arrayRemove(...elements: unknown[]): FieldValue {
  validateAtLeastNumberOfArgs('arrayRemove()', arguments, 1);
  // NOTE: We don't actually parse the data until it's used in set() or
  // update() since we'd need the Firestore instance to do this.
  return new FieldValueDelegate(
    new ArrayRemoveFieldValueImpl('arrayRemove', elements)
  );
}

/**
 * Returns a special value that can be used with `set()` or `update()` that tells
 * the server to increment the field's current value by the given value.
 *
 * If either the operand or the current field value uses floating point precision,
 * all arithmetic follows IEEE 754 semantics. If both values are integers,
 * values outside of JavaScript's safe number range (`Number.MIN_SAFE_INTEGER` to
 * `Number.MAX_SAFE_INTEGER`) are also subject to precision loss. Furthermore,
 * once processed by the Firestore backend, all integer operations are capped
 * between -2^63 and 2^63-1.
 *
 * If the current field value is not of type `number`, or if the field does not
 * yet exist, the transformation sets the field to the given value.
 *
 * @param n The value to increment by.
 * @return The FieldValue sentinel for use in a call to `set()` or `update()`.
 */
export function increment(n: number): FieldValue {
  return new FieldValueDelegate(
    new NumericIncrementFieldValueImpl('increment', n)
  );
}
