import MODELS from '../ai/models/index.js';
import logger from '../logger/index.js';
import Character from '../../models/character.js';

const BUILD_PERSON_TYPE = 'BUILD_PERSON';

async function buildPerson(data) {
    let character;
    try {

        character = await Character.findOne({ _id: data._id });

        if (!character) {
            throw new Error('Character not found');
        }

        character.metaData = character.metaData || {};
        character.metaData.state = Character.STATES.PROCESSING;
        await character.save();

        const GPT_MODEL_CLS = MODELS.getModel(MODELS.MODEL_NAMES.OpenAIGPT);
        const GPT_MODEL = new GPT_MODEL_CLS();

        const IMAGEN_MODEL_CLS = MODELS.getModel(MODELS.MODEL_NAMES.VertexAI);
        const IMAGEN_MODEL = new IMAGEN_MODEL_CLS(IMAGEN_MODEL_CLS.MODELS.IMAGEN);
    
        const response = await GPT_MODEL.generate(
            GPT_MODEL_CLS.PROMPTS[BUILD_PERSON_TYPE],
            { name: character.name, description: character.description },
            BUILD_PERSON_TYPE,
        );

        const parsedResponse = JSON.parse(response);
        const { 
            name,
            age,
            location,
            imageDescription,
            summary 
        } = parsedResponse;

        const predictions = await IMAGEN_MODEL.generate({ prompt: imageDescription }).catch(error => {
            logger.error(`Error encountered while generating image: ${error.message} for character: ${character._id}`);
        })

        let image = '';
        if (predictions) {
            image = predictions[0]?.bytesBase64Encoded;
        }

        const characterData = {
            name,
            age,
            location,
            image: {
                description: imageDescription,
                link: image ? `data:image/png;base64,${image}` : '',
            },
            summary,
            metaData: { state: Character.STATES.COMPLETED },
        };

        const characterForAssistant = {
            name,
            age,
            location,
            summary,
            description: character.description,
            tone: character.tone,
        }

        character.set(characterData);

        const assistant = await GPT_MODEL.startChat(characterForAssistant);

        character.assistant = assistant.id;

        await character.save();

    } catch (error) {
        logger.error(`Error encountered while building character: ${error.message}`);
    
        if (character) {
            character.metaData.state = Character.STATES.FAILED;
            character.metaData.errors.push(error.message);
            await character.save();
        }
    }
};

export default buildPerson;