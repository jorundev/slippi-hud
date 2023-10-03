'use strict';

import { Players } from '../types/schemas/players';
import * as nodecgApiContext from './util/nodecg-api-context';

const nodecg = nodecgApiContext.get();
const players = nodecg.Replicant<Players>('players');

//Statics
const playerCount = 4;

//Ensure we have enough player objects
if (players.value!.length < playerCount) {
    for (let i = players.value!.length; i < playerCount; i++) {
        const player = {
            id: i,
            slippiIndex: i % 2,
            teamId: -1,
            name: '',
            pronouns: '',
            sponsor: '',
            country: '',
            countryId: -1,
        };

        players.value!.push(player);
    }
}
