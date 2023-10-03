import type NodeCG from '@nodecg/types';
import * as nodecgApiContext from './util/nodecg-api-context';
import got from 'got';

import { Tournament } from '../types/schemas/tournament';
import { Players } from '../types/schemas/players';
import { Startgg } from '../types/schemas/startgg';
import { Standings } from '../types/schemas/standings';
import {
    SGGMatchQueryResponse,
    SGGSetQueryResponse,
    SGGStandingsQueryResponse,
    SGGStreamQueue,
    SGGStreamQueueSet,
    SGGTournamentEvent,
    SGGTournamentQueryResponse,
} from './util/startgg';

const nodecg = nodecgApiContext.get();

//Replicants
const tournament = nodecg.Replicant<Tournament>('tournament');
const players = nodecg.Replicant<Players>('players');
const startgg = nodecg.Replicant<Startgg>('startgg');
const tournamentStandings = nodecg.Replicant<Standings>('standings');

//Statics
const apiKey =
    nodecg.bundleConfig.api && nodecg.bundleConfig.api.startgg
        ? nodecg.bundleConfig.api.startgg.key
        : null;
const apiBaseURL = 'https://api.start.gg/gql/alpha';
const updateInterval = 30 * 1000;

//Dynamics
var apiTimeout: NodeJS.Timeout | null = null;
var lastPulledSetId: number | null = null;

//Templates
const tournamentQueryTemplateGQL = {
    operationName: 'TournamentQuery',
    query: `
query TournamentQuery($slug: String) {
		tournament(slug: $slug){
			id
			name
			streamQueue {
      			stream {
        			streamName
      			}
      			sets {
        			id
                    state
                    round
                    startedAt
                    completedAt
                    winnerId
					wPlacement
					lPlacement
      		    }
    	    }
			events {
				id
				name
				state
				type
			}
		}
}`,
    variables: { slug: '' },
};

const setQueryTemplateGQL = {
    operationName: 'SetQuery',
    query: `
query SetQuery($setId: ID!) {
		set(id: $setId){
			slots {
				entrant {
              		id
        			name
                    initialSeedNum
                    team {
						id
                        name
                        discriminator                                
                    }
              		participants {
          				id
                        gamerTag
                        prefix 
                        user {
							id
                            name 
                            slug
                            discriminator
                            genderPronoun
                            authorizations {                         
								id
                                externalId
                                externalUsername
                                type
                                url
                            }
                        }
        			}
      			}
      			standing {
        			placement
        			stats {
          				score {
            				value
          				}
        			}
      			}
    		}
		}
}`,
    variables: { setId: 0 },
};

const standingsQueryTemplateGQL = {
    operationName: 'StandingsQuery',
    query: `
query StandingsQuery($eventId: ID!, $page: Int!, $perPage: Int!) {
		event(id: $eventId){
			standings(query: {
				perPage: $perPage,
				page: $page,
				sortBy: "placement"
			}){
				nodes {
              		id
					isFinal
					placement
                    stats {
          				score {
            				value
          				}
        			}
					totalPoints
              		entrant {
              			id
        				name
						initialSeedNum
						team {
							id
							name
							discriminator                                
						}
              			participants {
          					id
							gamerTag
							prefix
							connectedAccounts
							user {
								id
								name 
								slug
								discriminator
								genderPronoun
                                location {
                                    countryId
                                    country
                                }
								authorizations {                         
									id
									externalId
									externalUsername
									type
									url
								}
							}
        				}
      				}
      			}
    		}
		}
}`,
    variables: { eventId: 0, page: 1, perPage: 8 },
};

const entrantSetQueryTemplateGQL = {
    operationName: 'SetQueryForEntrant',
    query: `
query SetQueryForEntrant($entrantId: ID!, $page: Int!, $perPage: Int!) {
		entrant(id: $entrantId){
			paginatedSets(
				perPage: $perPage
				page: $page
				sortType: RECENT
				filters: {
					state: 3
				}
			){
				nodes {
					id
					completedAt
					round
					lPlacement
					state
					winnerId
					games {
						id
						state
						orderNum
						winnerId
						stage {
							id
							name
						}
						selections {
							id
							orderNum
							selectionType
							selectionValue
							entrant {
								id
							}
						}
					}
				}
			}		
		}
}`,
    variables: { entrantId: 0, page: 1, perPage: 3 },
};

function isValidStartGGValue(
    value: Startgg | undefined,
    functionName: string
): value is Startgg {
    if (value !== undefined) {
        return true;
    }

    console.warn(`[${functionName}()]: startgg.value is undefined`);
    return false;
}

function isValidTournamentValue(
    value: Tournament | undefined,
    functionName: string
): value is Tournament {
    if (value !== undefined) {
        return true;
    }

    console.warn(`[${functionName}()]: tournament.value is undefined`);
    return false;
}

function isValidPlayersValue(
    value: Players | undefined,
    functionName: string
): value is Players {
    if (value !== undefined) {
        return true;
    }

    console.warn(`[${functionName}()]: players.value is undefined`);
    return false;
}

type RoundToTextTable = {
    winners: {
        [key: number]: string;
    };
    losers: {
        [key: number]: string;
    };
};

//Round calculation helper table
const roundToTextTable: RoundToTextTable = {
    winners: {
        2: 'Grand Finals',
        3: 'Winners Finals',
        5: 'Winners Semis',
    },
    losers: {
        3: 'Losers Finals',
        4: 'Losers Semis',
        5: 'Losers Top 6',
        7: 'Losers Top 8',
    },
};

//Exit if no key set
//if (!apiKey) throw new Error('No StartGG API key provided');

//Functions
function refreshTimeout() {
    if (!isValidStartGGValue(startgg.value, 'refreshTimeout')) {
        return;
    }

    if (
        !startgg.value.tournamentSlug ||
        startgg.value.tournamentSlug.length < 1
    )
        return;

    apiTimeout = setTimeout(() => {
        doUpdate();
    }, updateInterval);
}

function cancelTimeout() {
    if (apiTimeout) {
        clearTimeout(apiTimeout);
        apiTimeout = null;
    }
}

async function pullTournamentData(tournamentSlug: string) {
    const json = structuredClone(tournamentQueryTemplateGQL);
    json.variables.slug = tournamentSlug;

    const tournamentData = await got
        .post(apiBaseURL, {
            headers: {
                Authorization: 'Bearer ' + apiKey,
            },
            json,
        })
        .json();

    // TODO: validation, error handling
    return tournamentData as SGGTournamentQueryResponse;
}

async function pullMatchData(setID: number) {
    const json = structuredClone(setQueryTemplateGQL);
    json.variables.setId = setID;

    const matchData = await got
        .post(apiBaseURL, {
            headers: {
                Authorization: 'Bearer ' + apiKey,
            },
            json,
        })
        .json();

    // TODO: validation, error handling
    return matchData as SGGMatchQueryResponse;
}

async function pullEventStandings(
    eventID: number,
    pageNumber: number,
    entriesPerPage: number
) {
    const json = structuredClone(standingsQueryTemplateGQL);
    json.variables.eventId = eventID;
    json.variables.page = pageNumber;
    json.variables.perPage = entriesPerPage;

    const standings = await got
        .post(apiBaseURL, {
            headers: {
                Authorization: 'Bearer ' + apiKey,
            },
            json,
        })
        .json();

    // TODO: validation, error handling
    return standings as SGGStandingsQueryResponse;
}

async function pullLatestMatchDataFromEntrant(
    entrantID: number,
    pageNumber: number,
    entriesPerPage: number
) {
    const json = structuredClone(entrantSetQueryTemplateGQL);
    json.variables.entrantId = entrantID;
    json.variables.page = pageNumber;
    json.variables.perPage = entriesPerPage;

    const set = await got
        .post(apiBaseURL, {
            headers: {
                Authorization: 'Bearer ' + apiKey,
            },
            json,
        })
        .json();

    // TODO: validation, error handling
    return set as SGGSetQueryResponse;
}

async function doUpdate() {
    cancelTimeout();

    if (!isValidStartGGValue(startgg.value, 'doUpdate')) {
        return;
    }

    if (
        startgg.value.tournamentSlug &&
        startgg.value.tournamentSlug.length > 0
    ) {
        try {
            let tournyData = await pullTournamentData(
                startgg.value.tournamentSlug
            );

            //Confirm tournament exists
            if (!tournyData.data.tournament) {
                startgg.value.availableQueues = [];
                startgg.value.selectedQueue = -1;

                startgg.value.availableEvents = [];
                startgg.value.selectedEvent = -1;

                throw new Error('invalid_tournament_slug');
            }

            //Update tournament data if sync is enabled (higher priority)
            if (startgg.value.tournamentSyncEnabled) {
                //Generic tournament rep data
                //tournament.value.name = tournyData.data.tournament.name; //Comment: Don't pull for now as it doesn't seem useful

                //Update tournament info related to stream queue
                await updateByStreamQueue(tournyData);
            }

            //Always update tournament info related to events (lower priority)
            await updateByEvent(tournyData);
        } catch (ex) {
            console.error('[api-startgg] Error during API update:', ex);
        }
    } else {
        startgg.value.availableQueues = [];
        startgg.value.selectedQueue = -1;

        startgg.value.availableEvents = [];
        startgg.value.selectedEvent = -1;
    }

    refreshTimeout();
}

async function updateByStreamQueue(tournyData: SGGTournamentQueryResponse) {
    //If stream queue is set, but no longer available, clear it
    let activeQueueStreamName: string | null = null;

    if (!isValidStartGGValue(startgg.value, 'updateByStreamQueue')) {
        return;
    }
    if (!isValidTournamentValue(tournament.value, 'updateByStreamQueue')) {
        return;
    }
    if (!isValidPlayersValue(players.value, 'updateByStreamQueue')) {
        return;
    }

    if (
        startgg.value.selectedQueue !== undefined &&
        startgg.value.selectedQueue >= 0
    ) {
        // TODO: avoid using "!"
        let activeQueue =
            startgg.value.availableQueues?.length! > startgg.value.selectedQueue
                ? startgg.value.availableQueues?.[startgg.value.selectedQueue]
                : null;

        let matchingQueue: SGGStreamQueue | null = null;

        if (activeQueue) {
            if (tournyData.data.tournament.streamQueue) {
                matchingQueue =
                    tournyData.data.tournament.streamQueue.find((elem) => {
                        return (
                            activeQueue!.streamName === elem.stream.streamName
                        );
                    }) ?? null;
            }
        }

        if (!matchingQueue) {
            //Clear selected queue
            startgg.value.selectedQueue = -1;
        } else {
            activeQueueStreamName = activeQueue?.streamName ?? null;
        }
    }

    //Update stream queues if available
    const newQueues: Array<{
        streamName: string;
        activeSet: SGGStreamQueueSet;
    }> = [];

    if (tournyData.data.tournament.streamQueue) {
        for (const queue of tournyData.data.tournament.streamQueue) {
            //Find first active set of each queue
            const activeSet = queue.sets.find((set) => set.state === 2);

            if (activeSet !== undefined) {
                newQueues.push({
                    streamName: queue.stream.streamName,
                    activeSet,
                });
            }
        }
    }

    startgg.value.availableQueues = newQueues;

    //Identify selected stream queue by name and if necessary adjust the index (covers cases where the stream queue moves between API responses, needed to keep sync)
    if (activeQueueStreamName && startgg.value.availableQueues.length > 0) {
        let selectedStreamQueueIndex = startgg.value.availableQueues.findIndex(
            (elem) => {
                return activeQueueStreamName === elem.streamName;
            }
        );

        if (startgg.value.selectedQueue != selectedStreamQueueIndex) {
            startgg.value.selectedQueue = selectedStreamQueueIndex;
        }
    }

    //If a valid stream queue has been selected, check if it has an activeSet, if so pull it, else skip
    if (
        startgg.value.selectedQueue! >= 0 &&
        startgg.value.availableQueues.length > startgg.value.selectedQueue!
    ) {
        let activeQueue =
            startgg.value.availableQueues[startgg.value.selectedQueue!];

        if (activeQueue && activeQueue.activeSet && activeQueue.activeSet.id) {
            const matchData = await pullMatchData(activeQueue.activeSet.id);

            //Apply data to current match replicant
            //Best of automation if desired
            if (
                startgg.value.boAutomationEnabled &&
                startgg.value.boIntegerThreshold! > -1
            ) {
                let targetBestOf =
                    activeQueue.activeSet.lPlacement! >
                    startgg.value.boIntegerThreshold!
                        ? 3
                        : 5;
                tournament.value.bestOf = targetBestOf;
            }

            //Round calculation
            //console.log("Lowest place the loser of the active round:", activeQueue.activeSet.round, "can get:", activeQueue.activeSet.lPlacement);

            if (
                activeQueue.activeSet.round! >= 0 &&
                activeQueue.activeSet.lPlacement! > 8
            ) {
                tournament.value.round = `Winners Round ${activeQueue.activeSet.round}`;
            } else if (
                activeQueue.activeSet.round! < 0 &&
                activeQueue.activeSet.lPlacement! > 8
            ) {
                tournament.value.round = `Losers Round ${Math.abs(
                    activeQueue.activeSet.round! + 2
                )}`;
            } else {
                const round =
                    activeQueue.activeSet.round! >= 0
                        ? roundToTextTable.winners[
                              activeQueue.activeSet.lPlacement!
                          ]
                        : roundToTextTable.losers[
                              activeQueue.activeSet.lPlacement!
                          ];

                if (round) tournament.value.round = round;
                else
                    tournament.value.round =
                        activeQueue?.activeSet?.round?.toString();
            }

            //Only update the rest of the data (player info especially) when the set id changed
            if (
                lastPulledSetId == null ||
                activeQueue.activeSet.id != lastPulledSetId
            ) {
                lastPulledSetId = activeQueue.activeSet.id;

                let playerIndex = 0;

                //Check if at least one entrant has more than 1 participant, if so this is a team game
                let isTeams = false;

                for (let slot of matchData.data.set.slots) {
                    if (slot.entrant.participants.length > 1) {
                        isTeams = true;
                        break;
                    }
                }

                if (isTeams != tournament.value.isTeams)
                    tournament.value.isTeams = isTeams;

                for (let slot of matchData.data.set.slots) {
                    if (players.value.length <= playerIndex) break;

                    for (let participant of slot.entrant.participants) {
                        if (players.value.length <= playerIndex) break;

                        let oldName = players.value[playerIndex].name;

                        if (participant.gamerTag)
                            players.value[playerIndex].name =
                                participant.gamerTag;
                        else if (slot.entrant.name)
                            players.value[playerIndex].name = slot.entrant.name;

                        //Clear other fields on change of name
                        if (oldName != players.value[playerIndex].name) {
                            players.value[playerIndex].pronouns = '';
                            players.value[playerIndex].sponsor = '';
                        }

                        if (participant.user && participant.user.genderPronoun)
                            players.value[playerIndex].pronouns =
                                participant.user.genderPronoun;

                        if (
                            participant.user &&
                            participant.user.location.country &&
                            participant.user.location.countryId
                        ) {
                            players.value[playerIndex].country =
                                participant.user.location.country;
                            players.value[playerIndex].countryId =
                                participant.user.location.countryId;
                        }

                        if (slot.entrant.initialSeedNum) {
                            players.value[playerIndex].initialSeeding =
                                slot.entrant.initialSeedNum;
                        }

                        if (participant.prefix)
                            players.value[playerIndex].sponsor =
                                participant.prefix;

                        playerIndex++;
                    }
                }
            }
        }
    }
}

async function updateByEvent(tournyData: SGGTournamentQueryResponse) {
    //If an event is set, but no longer available, clear it
    let activeEventName: string | null = null;

    if (!isValidStartGGValue(startgg.value, 'updateByEvent')) {
        return;
    }

    if (startgg.value.selectedEvent! >= 0) {
        let activeEvent =
            startgg.value.availableEvents!.length > startgg.value.selectedEvent!
                ? startgg.value.availableEvents?.[startgg.value.selectedEvent!]
                : null;

        let matchingEvent: SGGTournamentEvent | null = null;

        if (activeEvent) {
            if (tournyData.data.tournament.events) {
                matchingEvent =
                    tournyData.data.tournament.events.find((elem) => {
                        return activeEvent!.name === elem.name;
                    }) ?? null;
            }
        }

        if (!matchingEvent) {
            //Clear selected event
            startgg.value.selectedEvent = -1;
        } else {
            activeEventName = activeEvent?.name ?? null;
        }
    }

    //Update events if available
    const newEvents: Array<SGGTournamentEvent> = [];

    if (tournyData.data.tournament.events) {
        for (const event of tournyData.data.tournament.events) {
            newEvents.push(event);
        }
    }

    startgg.value.availableEvents = newEvents;

    //Identify selected event by name and if necessary adjust the index (covers cases where the event moves between API responses, needed to keep sync)
    if (activeEventName && startgg.value.availableEvents.length > 0) {
        let selectedEventIndex = startgg.value.availableEvents.findIndex(
            (elem) => {
                return activeEventName === elem.name;
            }
        );

        if (startgg.value.selectedEvent != selectedEventIndex) {
            startgg.value.selectedEvent = selectedEventIndex;
        }
    }
}

async function generateTopStandings(ack: NodeCG.Acknowledgement | null = null) {
    //Generate Top 8 graphics data

    if (!isValidStartGGValue(startgg.value, 'generateTopStandings')) {
        return;
    }

    try {
        //If a valid event has been selected, pull standings, else skip
        if (
            startgg.value.selectedEvent! < 0 ||
            startgg.value.availableEvents!.length <=
                startgg.value.selectedEvent!
        )
            return;

        let activeEvent =
            startgg.value.availableEvents![startgg.value.selectedEvent!];

        if (!activeEvent || !('id' in activeEvent)) return;

        let res = await pullEventStandings(activeEvent.id!, 1, 8); //Grab top 8

        if (
            !res ||
            !res.data ||
            !res.data.event ||
            !res.data.event.standings ||
            !('nodes' in res.data.event.standings)
        )
            return;

        let standings = res.data.event.standings.nodes;

        let newStandings: Standings = [];

        for (let standing of standings) {
            let standingData = {
                placement: -1,
                name: '',
                isTeam: false,
                character: '',
                twitter: '',
            };

            standingData.placement = standing.placement;

            if (standing.entrant) {
                standingData.isTeam = standing.entrant.participants.length > 1;
                standingData.name = standing.entrant.name; //Team name in team mode, otherwise the participant name

                //Grab twitter if not team mode
                if (!standingData.isTeam) {
                    if (standing.entrant.participants[0].user) {
                        let user = standing.entrant.participants[0].user;

                        if (user.authorizations) {
                            for (let authorization of user.authorizations) {
                                if (authorization.type === 'TWITTER') {
                                    standingData.twitter =
                                        authorization.externalUsername;
                                    break;
                                }
                            }
                        }
                    }
                }

                //Pull last set this player/team finished and then the last game and see which character was used
                const latestSetRes = await pullLatestMatchDataFromEntrant(
                    standing.entrant.id,
                    1,
                    1
                );
                const latestSets = latestSetRes.data.entrant.paginatedSets;

                if (
                    latestSets &&
                    latestSets.nodes &&
                    latestSets.nodes.length > 0
                ) {
                    const latestSet = latestSets.nodes[0];

                    if (
                        latestSet &&
                        latestSet.games &&
                        latestSet.games.length > 0
                    ) {
                        let latestGame =
                            latestSet.games[latestSet.games.length - 1];

                        if (
                            latestGame.selections &&
                            latestGame.selections.length > 0
                        ) {
                            let characterSelections: Array<number> = [];

                            for (let selection of latestGame.selections) {
                                if (selection.entrant.id != standing.entrant.id)
                                    continue;

                                if (selection.selectionType != 'CHARACTER')
                                    continue;

                                //console.log("Entrant:", standing.entrant.name, "Pick:", selection.selectionValue);

                                characterSelections.push(
                                    convertStartGGCharacterIdToSlippiId(
                                        selection.selectionValue
                                    )
                                );
                            }

                            standingData.character =
                                characterSelections.join(',');
                        }
                    }
                }
            }

            newStandings.push(standingData);
        }

        tournamentStandings.value = newStandings;
    } catch (ex) {
        console.error('Standings update error:', ex);

        if (ack && !ack.handled)
            ack(new Error('Error generating the standings. See NodeCG log'));

        return;
    }

    console.log('Standings updated!');

    if (ack && !ack.handled) ack(null, 0);
}

//Rep Listeners
startgg.on('change', (newVal, oldVal) => {
    if (!newVal) return;

    if (startgg.value === undefined) {
        return;
    }

    let forceUpdate = false;

    //If tournament slug changes, clear selected queue and force update
    if (oldVal && oldVal.tournamentSlug != newVal.tournamentSlug) {
        startgg.value.selectedQueue = -1;
        startgg.value.selectedEvent = -1;

        lastPulledSetId = null;
        forceUpdate = true;
    }

    //If selected stream queue changes, force update
    if (oldVal && oldVal.selectedQueue != newVal.selectedQueue) {
        lastPulledSetId = null;
        forceUpdate = true;
    }

    if (forceUpdate || !oldVal) {
        doUpdate();
    }
});

//Message Listeners
nodecg.listenFor('api_startgg_refresh', () => {
    doUpdate(); //Force update
});

nodecg.listenFor('api_startgg_generateTopStandings', (value, ack) => {
    generateTopStandings(ack);
});

//Utils
function convertStartGGCharacterIdToSlippiId(charId: number): number {
    const startToSlippiCharTable: { [key: number]: number } = {
        1: 5,
        2: 0,
        3: 1,
        4: 22,
        5: 20,
        6: 2,
        7: 25,
        8: 14,
        9: 15,
        10: 4,
        11: 6,
        12: 7,
        13: 8,
        14: 9,
        15: 10,
        16: 3,
        17: 11,
        18: 12,
        19: 24,
        20: 13,
        21: 23,
        22: 16,
        23: 19,
        24: 17,
        25: 21,
        26: 18,
        628: 19,
        1744: -1,
    };

    return startToSlippiCharTable[charId];
}
