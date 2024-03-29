/* tslint:disable */
/* eslint-disable */
/**
 * Skribbl Typo API
 * Skribbl typo admin and auth api
 *
 * The version of the OpenAPI document: 1.0
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

import { exists, mapValues } from '../runtime';
/**
 * 
 * @export
 * @interface RegistrationRequest
 */
export interface RegistrationRequest {
    /**
     * The discord oauth authorization code
     * @type {string}
     * @memberof RegistrationRequest
     */
    code: string;
    /**
     * The flag whether the user wants to conenct to the typo server
     * @type {boolean}
     * @memberof RegistrationRequest
     */
    connectTypo: boolean;
}

/**
 * Check if a given object implements the RegistrationRequest interface.
 */
export function instanceOfRegistrationRequest(value: object): boolean {
    let isInstance = true;
    isInstance = isInstance && "code" in value;
    isInstance = isInstance && "connectTypo" in value;

    return isInstance;
}

export function RegistrationRequestFromJSON(json: any): RegistrationRequest {
    return RegistrationRequestFromJSONTyped(json, false);
}

export function RegistrationRequestFromJSONTyped(json: any, ignoreDiscriminator: boolean): RegistrationRequest {
    if ((json === undefined) || (json === null)) {
        return json;
    }
    return {
        
        'code': json['code'],
        'connectTypo': json['connectTypo'],
    };
}

export function RegistrationRequestToJSON(value?: RegistrationRequest | null): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    return {
        
        'code': value.code,
        'connectTypo': value.connectTypo,
    };
}

