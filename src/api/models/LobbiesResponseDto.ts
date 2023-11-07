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
import type { LobbyDetailsDto } from './LobbyDetailsDto';
import {
    LobbyDetailsDtoFromJSON,
    LobbyDetailsDtoFromJSONTyped,
    LobbyDetailsDtoToJSON,
} from './LobbyDetailsDto';
import type { PalantirLobbyDto } from './PalantirLobbyDto';
import {
    PalantirLobbyDtoFromJSON,
    PalantirLobbyDtoFromJSONTyped,
    PalantirLobbyDtoToJSON,
} from './PalantirLobbyDto';
import type { PalantirLobbyPlayerDto } from './PalantirLobbyPlayerDto';
import {
    PalantirLobbyPlayerDtoFromJSON,
    PalantirLobbyPlayerDtoFromJSONTyped,
    PalantirLobbyPlayerDtoToJSON,
} from './PalantirLobbyPlayerDto';

/**
 * 
 * @export
 * @interface LobbiesResponseDto
 */
export interface LobbiesResponseDto {
    /**
     * 
     * @type {PalantirLobbyDto}
     * @memberof LobbiesResponseDto
     */
    lobby: PalantirLobbyDto;
    /**
     * 
     * @type {LobbyDetailsDto}
     * @memberof LobbiesResponseDto
     */
    details: LobbyDetailsDto;
    /**
     * Lobby palantir players
     * @type {Array<PalantirLobbyPlayerDto>}
     * @memberof LobbiesResponseDto
     */
    players: Array<PalantirLobbyPlayerDto>;
}

/**
 * Check if a given object implements the LobbiesResponseDto interface.
 */
export function instanceOfLobbiesResponseDto(value: object): boolean {
    let isInstance = true;
    isInstance = isInstance && "lobby" in value;
    isInstance = isInstance && "details" in value;
    isInstance = isInstance && "players" in value;

    return isInstance;
}

export function LobbiesResponseDtoFromJSON(json: any): LobbiesResponseDto {
    return LobbiesResponseDtoFromJSONTyped(json, false);
}

export function LobbiesResponseDtoFromJSONTyped(json: any, ignoreDiscriminator: boolean): LobbiesResponseDto {
    if ((json === undefined) || (json === null)) {
        return json;
    }
    return {
        
        'lobby': PalantirLobbyDtoFromJSON(json['lobby']),
        'details': LobbyDetailsDtoFromJSON(json['details']),
        'players': ((json['players'] as Array<any>).map(PalantirLobbyPlayerDtoFromJSON)),
    };
}

export function LobbiesResponseDtoToJSON(value?: LobbiesResponseDto | null): any {
    if (value === undefined) {
        return undefined;
    }
    if (value === null) {
        return null;
    }
    return {
        
        'lobby': PalantirLobbyDtoToJSON(value.lobby),
        'details': LobbyDetailsDtoToJSON(value.details),
        'players': ((value.players as Array<any>).map(PalantirLobbyPlayerDtoToJSON)),
    };
}
