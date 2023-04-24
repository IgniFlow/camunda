import { Client, Variables, logger } from "camunda-external-task-client-js";
import dotenv from "dotenv";
import firebaseAdmin from "firebase-admin";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// Firebase config
dotenv.config();
const firebaseKey = JSON.parse(process.env.FIREBASE_KEY ?? "{}");
const firebaseApp = initializeApp({
  credential: firebaseAdmin.credential.cert(firebaseKey),
});
const auth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp);

// Camunda config
const config = {
  baseUrl: "http://localhost:8080/engine-rest",
  use: logger,
};
const client = new Client(config);

client.subscribe("authenticate-user", async function ({ task, taskService }) {
  console.log("Starting authenticate-user task");

  const token = task.variables.get("token");

  console.log("Got token: ", token);

  const variables = new Variables();

  // Check if token was provided
  if (!token) {
    console.log("No token provided");

    variables.setAll({
      authenticated: false,
      "error-message": "No token provided",
    });

    await taskService.complete(task, variables);
  } else {
    // Verify token
    let decodedUser = undefined;
    try {
      decodedUser = await auth.verifyIdToken(token);

      console.log("User authenticated");

      variables.set("authenticated", true);
      variables.set("user-id", decodedUser.uid);
    } catch (error) {
      console.log("Invalid token");

      variables.setAll({
        authenticated: false,
        "error-message": "Invalid token",
      });
    }
  }

  await taskService.complete(task, variables);
});

client.subscribe("retrieve-workspace", async function ({ task, taskService }) {
  console.log("Starting retrieve-workspace task");
  const userId = task.variables.get("user-id");
  const workspaceId = task.variables.get("workspace-id");

  console.log("Got workspace ID: ", workspaceId);

  const variables = new Variables();

  // Check if workspace ID was provided
  if (!workspaceId) {
    console.log("No workspace ID provided");

    variables.setAll({
      hasWorkspace: false,
      "error-message": "No workspace ID provided",
    });
  } else {
    let workspaces = undefined;
    // Find workspace in firestore
    try {
      const querySnapshot = await firestore
        .collection("workspaces")
        .where("ownerId", "==", userId)
        .get();

      workspaces = querySnapshot.docs.map((doc) => {
        return doc.id;
      });
    } catch (error) {
      console.log(error);
    }

    // Check if workspace was found
    if (!workspaces.includes(workspaceId)) {
      console.log("Workspace not found");

      variables.setAll({
        hasWorkspace: false,
        "error-message": "Workspace not found",
      });
    } else {
      // Workspace was found
      console.log("Workspace found");
      variables.set("hasWorkspace", true);
    }
  }

  await taskService.complete(task, variables);
});

client.subscribe("retrieve-team", async function ({ task, taskService }) {
  console.log("Starting retrieve-team task");

  const userId = task.variables.get("user-id");
  const teamId = task.variables.get("team-id");

  console.log("Got team ID: ", teamId);

  const variables = new Variables();

  // Check if team ID was provided
  if (!teamId) {
    console.log("No team ID provided");

    variables.setAll({
      hasTeam: false,
      "error-message": "No team ID provided",
    });
  } else {
    // Find team in firestore
    let teams = undefined;
    // Find workspace in firestore
    try {
      const querySnapshot = await firestore
        .collection("teams")
        .where("members", "array-contains", userId)
        .get();

      teams = querySnapshot.docs.map((doc) => {
        return doc.id;
      });
    } catch (error) {
      console.log(error);
    }

    // Check if team was found
    if (!teams.includes(teamId)) {
      console.log("team not found");

      variables.setAll({
        hasTeam: false,
        "error-message": "Team not found",
      });
    } else {
      // Team was found
      console.log("Team found");
      variables.set("hasTeam", true);
    }
  }

  await taskService.complete(task, variables);
});

client.subscribe("create-task", async function ({ task, taskService }) {
  console.log("Starting create-task task");

  const workspaceId = task.variables.get("workspace-id");
  const teamId = task.variables.get("team-id");
  const userId = task.variables.get("user-id");

  const taskTitle = task.variables.get("task-title");
  const taskDescription = task.variables.get("task-description");
  const taskColumn = task.variables.get("task-column");

  const variables = new Variables();

  if (!taskTitle || !taskDescription || !taskColumn) {
    console.log("Missing task data");

    variables.setAll({
      taskCreated: false,
      "error-message": "Missing task data",
    });
  } else {
    // Create task in firestore
    await firestore.collection("documents").doc().set({
      title: taskTitle,
      description: taskDescription,
      column: taskColumn,
      user: userId,
    });

    // Task created
    console.log("Task created");
    variables.setAll({
      taskCreated: true,
      "notification-message": "Task created",
    });

    await taskService.complete(task, variables);
  }
});

client.subscribe("notify-user", async function ({ task, taskService }) {
  console.log("Starting notify-user task");

  const message = task.variables.get("notification-message");

  console.log(message);

  await taskService.complete(task);
});

client.subscribe("throw-error", async function ({ task, taskService }) {
  console.log("Starting throw-error task");

  const message = task.variables.get("error-message");

  console.log(message);

  await taskService.complete(task);
});
