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
 * @interface DropDto
 */
export interface DropDto {
    /**
     * Drop ID
     * @type {number}
     * @memberof DropDto
     */
    dropID: number;
    /**
     * Lobby where the drop has been caught
     * @type {string}
     * @memberof DropDto
     */
    caughtLobbyKey: string;
    /**
     * Discord User ID of the catcher
     * @type {string}
     * @memberof DropDto
     */
    caughtLobbyPlayerID: string;
    /**
     * Timestamp of the drop
     * @type {string}
     * @memberof DropDto
     */
    validFrom: string;
    /**
     * Event Drop ID
     * @type {number}
     * @memberof DropDto
     */
    eventDropID: number;
    /**
     * Response time of the catch
     * @type {number}
     * @memberof DropDto
     */
    leagueWeight: number;
}

/**
 * Check if a given object implements the DropDto interface.
 */
export function instanceOfDropDto(value: object): boolean {
    let isInstance = true;
    isInstance = isInstance && "dropID" in value;
    isInstance = isInstance && "caughtLobbyKey" in value;
    isInstance = isInstance && "caughtLobbyPlayerID" in value;
    isInstance = isInstance && "validFrom" in value;
    isInstance = isInstance && "eventDropID" in value;
    isInstance = isInstance && "leagueWeight" in value;

    return isInstance;
}

export function DropDtoFromJSON(json: any): DropDto {
    return DropDtoFromJSONTyped(json, false);
}

export function DropDtoFromJSONTyped(json: any, ignoreDiscriminator: boolean): DropDto {
    if ((json === undefined) || (json === null)) {
        return json;
    }
    return {
        
        'dropID': json['DropID'],
        'caughtLobbyKey': json['CaughtLobbyKey'],
        'caughtLobbyPlayerID': json['CaughtLobbyPlayerID'],
        'validFrom': json['ValidFrom'],
        'eventDropID': json['EventDropID'],
        'leagueWeight': json['LeagueWeight'],
    };
}

export function DropDtoToJSON(value?: DropDto | null): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    return {
        
        'DropID': value.dropID,
        'CaughtLobbyKey': value.caughtLobbyKey,
        'CaughtLobbyPlayerID': value.caughtLobbyPlayerID,
        'ValidFrom': value.validFrom,
        'EventDropID': value.eventDropID,
        'LeagueWeight': value.leagueWeight,
    };
}
