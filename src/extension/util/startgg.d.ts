// TODO: auto generate these types?
export type SGGStreamQueueSet = {
    id: number;
    state: number;
    round: number;
    startedAt: number;
    completedAt: number;
    winnerId: number;
    wPlacement: number;
    lPlacement: number;
};

export type SGGStreamQueue = {
    stream: {
        streamName: string;
    };
    sets: Array<SGGStreamQueueSet>;
};

export type SGGTournamentEvent = {
    id: number;
    name: string;
    state: string;
    type: number;
};

export type SGGTournamentQueryResponse = {
    data: {
        tournament: {
            id: string;
            name: string;
            streamQueue: Array<SGGStreamQueue> | null;
            events: Array<SGGTournamentEvent> | null;
        };
    };
};

export type SGGMatchUserAuthorization = {
    id: number;
    externalId: string;
    externalUsername: string;
    type: string;
    url: string | null;
};

export type SGGMatchUser = {
    id: number;
    name: string;
    slug: string;
    discriminator: string;
    genderPronoun: string | null;
    location: {
        countryId: number | null;
        country: string;
    };
    authorizations: Array<SGGMatchUserAuthorization>;
};

export type SGGMatchParticipant = {
    id: number;
    gamerTag: string;
    prefix: string | null;
    user: SGGMatchUser;
};

export type SGGMatchTeam = {
    id: number;
    name: string | null;
    discriminator: string;
};

export type SGGMatchEntrant = {
    id: number;
    name: string;
    initialSeedNum: number;
    team: SGGMatchTeam | null;
    participants: Array<SGGMatchParticipant>;
};

export type SGGMatchSlot = {
    entrant: SGGMatchEntrant;
    standing: {
        placement: number;
        stats: {
            score: {
                value: number;
            };
        };
    };
};

export type SGGMatchQueryResponse = {
    data: {
        set: {
            slots: Array<SGGMatchSlot>;
        };
    };
};

export type SGGStandingsNode = {
    id: number;
    isFinal: boolean;
    placement: number;
    stats: {
        score: null; // TODO
    };
    totalPoints: null; // TODO
    entrant: SGGMatchEntrant;
};

export type SGGStandingsQueryResponse = {
    data: {
        event: {
            standings: {
                nodes: Array<SGGStandingsNode>;
            };
        };
    };
};

export type SGGSetGameSelection = {
    id: number;
    orderNum: null; // TODO
    selectionType: string;
    selectionValue: number;
    entrant: {
        id: number;
    };
};

export type SGGSetGame = {
    id: number;
    state: number;
    orderNum: number;
    winnerId: number;
    stage: {
        id: number;
        name: string;
    } | null;
    selections: Array<SGGSetGameSelection>;
};

export type SGGSetNode = {
    id: number;
    completedAt: number;
    round: number;
    lPlacement: number;
    state: number;
    winnerId: number;
    games: Array<SGGSetGame>;
};

export type SGGSetQueryResponse = {
    data: {
        entrant: {
            paginatedSets: {
                nodes: Array<SGGSetNode>;
            };
        };
    };
};
