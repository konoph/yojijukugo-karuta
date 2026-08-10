const Alexa = require('ask-sdk-core');
const scenarios = require('./data/scenarios.json');

const BREAK_MS = 700;

// 読み間違いを避けるため、表示用の漢字混じりscriptではなく
// 全文ひらがなのscriptReadingを読み上げに使う。
function buildScenarioSsml(item, trailingText) {
    const idx = item.scriptReading.lastIndexOf(item.reading);
    const body = idx === -1
        ? item.scriptReading
        : `${item.scriptReading.slice(0, idx)}<break time="${BREAK_MS}ms"/>${item.scriptReading.slice(idx)}`;
    const trailer = trailingText ? `<break time="500ms"/>${trailingText}` : '';
    return `<speak>${body}${trailer}</speak>`;
}

// 未出題のシナリオから1つランダムに選び、セッション属性を更新して返す。
// 全問出題済みならnullを返す。
function pickNextScenario(sessionAttributes) {
    const answeredIndices = sessionAttributes.answeredIndices || [];
    const remaining = scenarios
        .map((_, index) => index)
        .filter((index) => !answeredIndices.includes(index));

    if (remaining.length === 0) {
        return null;
    }

    const pickedIndex = remaining[Math.floor(Math.random() * remaining.length)];
    const newAnsweredIndices = answeredIndices.concat(pickedIndex);

    sessionAttributes.answeredIndices = newAnsweredIndices;

    return {
        scenario: scenarios[pickedIndex],
        isLast: newAnsweredIndices.length === scenarios.length
    };
}

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const sessionAttributes = {};
        const result = pickNextScenario(sessionAttributes);
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        const speakOutput = buildScenarioSsml(
            result.scenario,
            result.isLast ? 'これで全部の問題が終わりです。お疲れさまでした！' : null
        );

        const responseBuilder = handlerInput.responseBuilder.speak(speakOutput);

        if (result.isLast) {
            return responseBuilder.withShouldEndSession(true).getResponse();
        }

        return responseBuilder
            .reprompt('<speak>「次」と言うと、次の問題に進みます。</speak>')
            .getResponse();
    }
};

const NextIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'NextIntent';
    },
    handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const result = pickNextScenario(sessionAttributes);
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        if (!result) {
            return handlerInput.responseBuilder
                .speak('<speak>もう問題は残っていません。これでゲーム終了です。お疲れさまでした！</speak>')
                .withShouldEndSession(true)
                .getResponse();
        }

        const speakOutput = buildScenarioSsml(
            result.scenario,
            result.isLast ? 'これで全部の問題が終わりです。お疲れさまでした！' : null
        );

        const responseBuilder = handlerInput.responseBuilder.speak(speakOutput);

        if (result.isLast) {
            return responseBuilder.withShouldEndSession(true).getResponse();
        }

        return responseBuilder
            .reprompt('<speak>「次」と言うと、次の問題に進みます。</speak>')
            .getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = '四字熟語カルタです。読み上げるお話をよく聞いて、最後に出てくる四字熟語の札を取ってください。「次」と言うと、次の問題に進みます。';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'また遊ぼうね。さようなら！';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .withShouldEndSession(true)
            .getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'ごめんなさい、よくわかりませんでした。「次」と言うと次の問題に進みます。';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        return handlerInput.responseBuilder.getResponse();
    }
};

const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `${intentName} が呼ばれました。`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = 'すみません、うまく処理できませんでした。もう一度お試しください。';
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        NextIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler)
    .addErrorHandlers(
        ErrorHandler)
    .withCustomUserAgent('yojijukugo-karuta/v1.0')
    .lambda();
