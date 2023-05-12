import { Client, Variables, logger } from 'camunda-external-task-client-js';
import dotenv from 'dotenv';
import firebaseAdmin from 'firebase-admin';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase config
dotenv.config();
const firebaseKey = JSON.parse(process.env.FIREBASE_KEY ?? '{}');
const firebaseApp = initializeApp({
    credential: firebaseAdmin.credential.cert(firebaseKey),
});
const auth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp);

// Camunda config
const config = {
    baseUrl: 'http://localhost:8080/engine-rest',
    use: logger,
};
const client = new Client(config);

client.subscribe('authenticate_user', async function ({ task, taskService }) {
    console.log('Starting authenticate_user task');

    const token = task.variables.get('token');

    console.log('Got token: ', token);

    const variables = new Variables();

    // Check if token was provided
    if (!token) {
        console.log('No token provided');
        variables.set('authenticated', false);
    } else {
        // Verify token
        let decodedUser = undefined;

        try {
            decodedUser = await auth.verifyIdToken(token);

            console.log('User authenticated');

            variables.set('authenticated', true);
            variables.set('user_id', decodedUser.uid);
        } catch (error) {
            console.log('Invalid token');
            variables.set('authenticated', false);
        }
    }

    await taskService.complete(task, variables);
});

client.subscribe('retrieve_workspace', async function ({ task, taskService }) {
    console.log('Starting retrieve_workspace task');
    const userId = task.variables.get('user_id');
    const workspaceId = task.variables.get('workspace_id');

    console.log('Got workspace ID: ', workspaceId);

    const variables = new Variables();

    // Check if workspace ID was provided
    if (!workspaceId) {
        console.log('No workspace ID provided');
        variables.set('has_workspace', false);
    } else {
        let workspaces = undefined;
        // Find workspace in firestore
        try {
            const querySnapshot = await firestore
                .collection('workspaces')
                .where('ownerId', '==', userId)
                .get();

            workspaces = querySnapshot.docs.map((doc) => {
                return doc.id;
            });
        } catch (error) {
            console.log(error);
            variables.set('has_workspace', false);
        }

        // Check if workspace was found
        if (!workspaces.includes(workspaceId)) {
            console.log('Workspace not found');
            variables.set('has_workspace', false);
        } else {
            // Workspace was found
            console.log('Workspace found');
            variables.set('has_workspace', true);
        }
    }

    await taskService.complete(task, variables);
});

client.subscribe('retrieve_team', async function ({ task, taskService }) {
    console.log('Starting retrieve_team task');

    const userId = task.variables.get('user_id');
    const teamId = task.variables.get('team_id');

    console.log('Got team ID: ', teamId);

    const variables = new Variables();

    // Check if team ID was provided
    if (!teamId) {
        console.log('No team ID provided');
        variables.set('has_team', false);
    } else {
        // Find team in firestore
        let teams = undefined;
        // Find workspace in firestore
        try {
            const querySnapshot = await firestore
                .collection('teams')
                .where('members', 'array-contains', userId)
                .get();

            teams = querySnapshot.docs.map((doc) => {
                return doc.id;
            });
        } catch (error) {
            console.log(error);
            variables.set('has_team', false);
        }

        // Check if team was found
        if (!teams.includes(teamId)) {
            console.log('team not found');
            variables.set('has_team', false);
        } else {
            // Team was found
            console.log('Team found');
            variables.set('has_team', true);
        }
    }

    await taskService.complete(task, variables);
});

client.subscribe('create_task', async function ({ task, taskService }) {
    console.log('Starting create_task task');

    const workspaceId = task.variables.get('workspace_id');
    const teamId = task.variables.get('team_id');
    const userId = task.variables.get('user_id');
    const documentId = task.variables.get('document_id');

    const taskTitle = task.variables.get('task_title');
    const taskDescription = task.variables.get('task_description');
    const taskColumn = task.variables.get('task_column');

    const variables = new Variables();

    if (!taskColumn) {
        console.log('Missing task data');

        variables.setAll({
            taskCreated: false,
            'error-message': 'Missing task data',
        });
    } else {
        // Create task in firestore
        await firestore.collection('documents').add({
            workspaceId,
            documentId,
            type: 'item',
            views: null,
            title: taskTitle,
            content: taskDescription,
            ownerId: userId,
            properties: {
                status: taskColumn,
                assignee: [],
            },
        });

        // Task created
        console.log('Task created');

        await taskService.complete(task, variables);
    }
});
