import * as vscode from 'vscode';
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env variables
dotenv.config(); 

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
    console.error('API Key is not defined. Please check your .env file.');
    vscode.window.showErrorMessage('API Key is not defined. Please check your .env file.');
} else {
    console.log('OpenAI API Key loaded successfully');
}

const OPENAI_API_URL = 'https://api.openai.com/v1/completions';

// Define the structure of the OpenAI response
interface OpenAIResponse {
    choices: { text: string }[];
}

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('taskPlanner.planTask', async () => {
        try {
            const taskDescription = await vscode.window.showInputBox({
                prompt: 'Enter your task description'
            });

            if (taskDescription) {
                const plan = await generateTaskPlanWithOpenAI(taskDescription);

                if (plan) {
                    vscode.window.showInformationMessage(`Task Plan: ${plan}`);
                } else {
                    vscode.window.showErrorMessage('OpenAI did not return a plan.');
                }
            } else {
                vscode.window.showErrorMessage('No task description provided.');
            }
        } catch (error) {
            if (error instanceof Error) {
                vscode.window.showErrorMessage(`Error generating task plan: ${error.message}`);
            } else {
                vscode.window.showErrorMessage('Unknown error generating task plan.');
            }
        }
    });

    context.subscriptions.push(disposable);
}

async function generateTaskPlanWithOpenAI(taskDescription: string): Promise<string | undefined> {
    try {
        // Analyze codebase by reading the files in the workspace folder
        const codebase = await analyzeCodebase();

        // Create prompt for OpenAI to generate task plan
        const prompt = `Analyze the following codebase and generate a task plan for the task: "${taskDescription}"\n\nCodebase:\n${codebase}`;

        // Ensure the OpenAI API key is available
        if (!OPENAI_API_KEY) {
            throw new Error('OpenAI API Key is missing. Please check your .env file.');
        }

        // Get a response from OpenAI
        const response = await axios.post<OpenAIResponse>(OPENAI_API_URL, {
            model: 'text-davinci-003',  // Use GPT-3 (you can use GPT-4 if you have access)
            prompt: prompt,
            max_tokens: 150,
            temperature: 0.7,
        }, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        console.log('OpenAI response:', response.data);  // Debugging the full response

        // Extract the response from OpenAI API
        const plan = response.data.choices[0].text.trim();
        return plan;
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            console.error('OpenAI API error:', error.response ? error.response.data : error.message);
            vscode.window.showErrorMessage(`API error: ${error.response?.data?.error?.message || error.message}`);
        } else if (error instanceof Error) {
            console.error('Unexpected error:', error.message);
            vscode.window.showErrorMessage(`Unexpected error: ${error.message}`);
        }
        throw new Error('Failed to generate task plan with OpenAI');
    }
}

async function analyzeCodebase(): Promise<string> {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder found.');
            throw new Error('No workspace folder found.');
        }

        const folderPath = workspaceFolders[0].uri.fsPath;
        const files = await readFilesRecursively(folderPath);
        return files.join('\n');  // Combine the contents of all files in the codebase
    } catch (error) {
        console.error('Error analyzing codebase:', error instanceof Error ? error.message : 'Unknown error');
        throw new Error('Failed to analyze the codebase.');
    }
}

// Read all files recursively from a folder
async function readFilesRecursively(dirPath: string): Promise<string[]> {
    let fileContents: string[] = [];
    const files = await fs.promises.readdir(dirPath);

    for (let file of files) {
        const fullPath = path.join(dirPath, file);
        const stats = await fs.promises.stat(fullPath);

        if (stats.isDirectory()) {
            fileContents = fileContents.concat(await readFilesRecursively(fullPath));  // Recursively read subdirectories
        } else if (stats.isFile() && file.endsWith('.ts')) {  // Filter for TypeScript files
            const content = await fs.promises.readFile(fullPath, 'utf-8');
            fileContents.push(content);
        }
    }

    return fileContents;
}

export function deactivate() {
    console.log('Task Planner extension is now deactivated.');
}