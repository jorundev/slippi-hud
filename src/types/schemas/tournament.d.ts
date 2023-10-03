/* eslint-disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

export interface Tournament {
    name?: string;
    round?: string;
    bestOf?: number;
    isTeams?: boolean;
    commentators?: {
        id?: number;
        name?: string;
        info?: string;
        [k: string]: unknown;
    }[];
    scores?: {
        score?: number;
        rawResults?: number[];
        [k: string]: unknown;
    }[];
    autoScore?: boolean;
    inputDisplay?: boolean;
    matchScored?: boolean;
    [k: string]: unknown;
}
