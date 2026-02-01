
export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
  maps?: {
    uri:string;
    title: string;
    placeAnswerSources?: {
      reviewSnippets: {
        uri: string;
        title: string;
      }[];
    }
  };
}

export interface StoryElements {
    characters: string;
    story: string;
    today: string;
}

export interface AnalyzedCharacter {
    name: string;
    gender: 'male' | 'female' | 'unknown';
    race?: string;
    voiceDescription?: string;
    otherDescriptors?: string;
}
// FIX: Added missing type definitions for PresentationPlayer component.
export interface GeneratedAudio {
    sceneIndex: number;
    audioBlob: Blob;
}

export type SceneElement = {
    type: 'action';
    content?: string;
} | {
    type: 'dialogue_block';
    character: string;
    elements: Array<{
        type: 'dialogue' | 'parenthetical';
        content: string;
    }>;
};

export interface Script {
    scene_elements: SceneElement[];
}
