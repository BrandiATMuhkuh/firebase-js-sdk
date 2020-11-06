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

import { DocumentData } from '@firebase/firestore-types';

import {
  ArrayValue as ProtoArrayValue,
  LatLng as ProtoLatLng,
  MapValue as ProtoMapValue,
  Timestamp as ProtoTimestamp,
  Value as ProtoValue
} from '../protos/firestore_proto_api';
import { GeoPoint } from './geo_point';
import { Timestamp } from './timestamp';
import { DatabaseId } from '../core/database_info';
import { DocumentKey } from '../model/document_key';
import {
  normalizeByteString,
  normalizeNumber,
  normalizeTimestamp,
  typeOrder
} from '../model/values';
import {
  getLocalWriteTime,
  getPreviousValue
} from '../model/server_timestamps';
import { fail, hardAssert } from '../util/assert';
import { forEach } from '../util/obj';
import { TypeOrder } from '../model/object_value';
import { ResourcePath } from '../model/path';
import { isValidResourceName } from '../remote/serializer';
import { logError } from '../util/log';
import { ByteString } from '../util/byte_string';
import { Bytes } from '../../lite/src/api/bytes';

export type ServerTimestampBehavior = 'estimate' | 'previous' | 'none';

/**
 * Converts Firestore's internal types to the JavaScript types that we expose
 * to the user.
 */
export class UserDataWriter {
  constructor(
    private readonly databaseId: DatabaseId,
    private readonly referenceFactory: (key: DocumentKey) => unknown,
    private readonly bytesFactory: (bytes: ByteString) => Bytes
  ) {}

  convertValue(
    value: ProtoValue,
    serverTimestampBehavior: ServerTimestampBehavior
  ): unknown {
    switch (typeOrder(value)) {
      case TypeOrder.NullValue:
        return null;
      case TypeOrder.BooleanValue:
        return value.booleanValue!;
      case TypeOrder.NumberValue:
        return normalizeNumber(value.integerValue || value.doubleValue);
      case TypeOrder.TimestampValue:
        return this.convertTimestamp(value.timestampValue!);
      case TypeOrder.ServerTimestampValue:
        return this.convertServerTimestamp(value, serverTimestampBehavior);
      case TypeOrder.StringValue:
        return value.stringValue!;
      case TypeOrder.BlobValue:
        return this.bytesFactory(normalizeByteString(value.bytesValue!));
      case TypeOrder.RefValue:
        return this.convertReference(value.referenceValue!);
      case TypeOrder.GeoPointValue:
        return this.convertGeoPoint(value.geoPointValue!);
      case TypeOrder.ArrayValue:
        return this.convertArray(value.arrayValue!, serverTimestampBehavior);
      case TypeOrder.ObjectValue:
        return this.convertObject(value.mapValue!, serverTimestampBehavior);
      default:
        throw fail('Invalid value type: ' + JSON.stringify(value));
    }
  }

  private convertObject(
    mapValue: ProtoMapValue,
    serverTimestampBehavior: ServerTimestampBehavior
  ): DocumentData {
    const result: DocumentData = {};
    forEach(mapValue.fields || {}, (key, value) => {
      result[key] = this.convertValue(value, serverTimestampBehavior);
    });
    return result;
  }

  private convertGeoPoint(value: ProtoLatLng): GeoPoint {
    return new GeoPoint(
      normalizeNumber(value.latitude),
      normalizeNumber(value.longitude)
    );
  }

  private convertArray(
    arrayValue: ProtoArrayValue,
    serverTimestampBehavior: ServerTimestampBehavior
  ): unknown[] {
    return (arrayValue.values || []).map(value =>
      this.convertValue(value, serverTimestampBehavior)
    );
  }

  private convertServerTimestamp(
    value: ProtoValue,
    serverTimestampBehavior: ServerTimestampBehavior
  ): unknown {
    switch (serverTimestampBehavior) {
      case 'previous':
        const previousValue = getPreviousValue(value);
        if (previousValue == null) {
          return null;
        }
        return this.convertValue(previousValue, serverTimestampBehavior);
      case 'estimate':
        return this.convertTimestamp(getLocalWriteTime(value));
      default:
        return null;
    }
  }

  private convertTimestamp(value: ProtoTimestamp): Timestamp {
    const normalizedValue = normalizeTimestamp(value);
    return new Timestamp(normalizedValue.seconds, normalizedValue.nanos);
  }

  private convertReference(name: string): unknown {
    const resourcePath = ResourcePath.fromString(name);
    hardAssert(
      isValidResourceName(resourcePath),
      'ReferenceValue is not valid ' + name
    );
    const databaseId = new DatabaseId(resourcePath.get(1), resourcePath.get(3));
    const key = new DocumentKey(resourcePath.popFirst(5));

    if (!databaseId.isEqual(this.databaseId)) {
      // TODO(b/64130202): Somehow support foreign references.
      logError(
        `Document ${key} contains a document ` +
          `reference within a different database (` +
          `${databaseId.projectId}/${databaseId.database}) which is not ` +
          `supported. It will be treated as a reference in the current ` +
          `database (${this.databaseId.projectId}/${this.databaseId.database}) ` +
          `instead.`
      );
    }

    return this.referenceFactory(key);
  }
}
