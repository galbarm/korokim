//fill and rename to default.ts

import { CompanyTypes } from 'israeli-bank-scrapers';

export default {
    mongoUrl: "",

    sendGrid: {
        apiKey: "",
        templateId: "",
        from: {
            email: "verified_sendgrid@email.address",
            name: "name"
        },
        targets: ["target1@gmail.com", "target2@gmail.com"]
    },

    friendlyNames: {
        "1111": "max",
        "2222": "הפועלים"
    },

    daysAgo: 7,

    updateIntervalMin: 60,

    toIgnore: [
        "bad transaction"
    ],

    accounts: [
        {
            company: CompanyTypes.visaCal,
            username: "username1",
            password: "password1"
        },
        {
            company: CompanyTypes.max,
            username: "username2",
            password: "password2"
        },
        {
            company: CompanyTypes.hapoalim,
            userCode: "username3",
            password: "password3"
        },
    ],
}