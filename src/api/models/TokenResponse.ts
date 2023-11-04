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
 * @interface TokenResponse
 */
export interface TokenResponse {
    /**
     * The acces token to log in to the new account
     * @type {string}
     * @memberof TokenResponse
     */
    accessToken: string;
    /**
     * The discord user id of the oauth code
     * @type {string}
     * @memberof TokenResponse
     */
    userId: string;
    /**
     * The discord user name of the oauth code
     * @type {string}
     * @memberof TokenResponse
     */
    userName: string;
}

/**
 * Check if a given object implements the TokenResponse interface.
 */
export function instanceOfTokenResponse(value: object): boolean {
    let isInstance = true;
    isInstance = isInstance && "accessToken" in value;
    isInstance = isInstance && "userId" in value;
    isInstance = isInstance && "userName" in value;

    return isInstance;
}

export function TokenResponseFromJSON(json: any): TokenResponse {
    return TokenResponseFromJSONTyped(json, false);
}

export function TokenResponseFromJSONTyped(json: any, ignoreDiscriminator: boolean): TokenResponse {
    if ((json === undefined) || (json === null)) {
        return json;
    }
    return {
        
        'accessToken': json['accessToken'],
        'userId': json['userId'],
        'userName': json['userName'],
    };
}

export function TokenResponseToJSON(value?: TokenResponse | null): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    return {
        
        'accessToken': value.accessToken,
        'userId': value.userId,
        'userName': value.userName,
    };
}

