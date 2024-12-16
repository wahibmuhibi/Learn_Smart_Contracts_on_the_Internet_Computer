import { v4 as uuidv4 } from "uuid";
import { ic, Server, StableBTreeMap } from "azle";
import express from "express";
import cors from "cors";
import { body, validationResult, query } from "express-validator";

export default Server(() => {
  class Message {
    constructor(id, title, body, attachmentURL, createdAt, updatedAt = null) {
      this.id = id;
      this.title = title;
      this.body = body;
      this.attachmentURL = attachmentURL;
      this.createdAt = createdAt;
      this.updatedAt = updatedAt;
    }
  }

  const messagesStorage = new StableBTreeMap<string, Message>(0);

  const app = express();

  // Middleware
  app.use(cors()); // Enable CORS for cross-origin requests
  app.use(express.json());

  // Helper function to get the current date
  function getCurrentDate() {
    const timestamp = Number(ic.time());
    return new Date(timestamp / 1_000_000); // Convert nanoseconds to milliseconds
  }

  // Middleware to handle validation errors
  const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  };

  // POST /messages - Create a new message
  app.post(
    "/messages",
    [
      body("title").notEmpty().withMessage("Title is required."),
      body("body").notEmpty().withMessage("Body is required."),
      body("attachmentURL").optional().isURL().withMessage("Attachment URL must be a valid URL."),
    ],
    handleValidationErrors,
    (req, res) => {
      const { title, body, attachmentURL } = req.body;

      const message = new Message(uuidv4(), title, body, attachmentURL || "", getCurrentDate());
      messagesStorage.insert(message.id, message);
      res.status(201).json(message);
    }
  );

  // GET /messages - Retrieve all messages with optional pagination
  app.get(
    "/messages",
    [
      query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer."),
      query("limit").optional().isInt({ min: 1 }).withMessage("Limit must be a positive integer."),
    ],
    handleValidationErrors,
    (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const messages = Array.from(messagesStorage.values());
      const startIndex = (page - 1) * limit;
      const endIndex = page * limit;

      const paginatedMessages = messages.slice(startIndex, endIndex);
      res.json({
        total: messages.length,
        page,
        limit,
        totalPages: Math.ceil(messages.length / limit),
        data: paginatedMessages,
      });
    }
  );

  // GET /messages/:id - Retrieve a specific message by ID
  app.get("/messages/:id", (req, res) => {
    const messageId = req.params.id;
    const message = messagesStorage.get(messageId);

    if (!message) {
      return res.status(404).json({ error: `Message with ID ${messageId} not found.` });
    }

    res.json(message);
  });

  // PUT /messages/:id - Update an existing message
  app.put(
    "/messages/:id",
    [
      body("title").optional().isString(),
      body("body").optional().isString(),
      body("attachmentURL").optional().isURL().withMessage("Attachment URL must be a valid URL."),
    ],
    handleValidationErrors,
    (req, res) => {
      const messageId = req.params.id;
      const existingMessage = messagesStorage.get(messageId);

      if (!existingMessage) {
        return res.status(404).json({ error: `Message with ID ${messageId} not found.` });
      }

      const { title, body, attachmentURL } = req.body;
      const updatedMessage = new Message(
        messageId,
        title || existingMessage.title,
        body || existingMessage.body,
        attachmentURL || existingMessage.attachmentURL,
        existingMessage.createdAt,
        getCurrentDate()
      );

      messagesStorage.insert(messageId, updatedMessage);
      res.json(updatedMessage);
    }
  );

  // DELETE /messages/:id - Delete a message
  app.delete("/messages/:id", (req, res) => {
    const messageId = req.params.id;
    const deletedMessage = messagesStorage.remove(messageId);

    if (!deletedMessage) {
      return res.status(404).json({ error: `Message with ID ${messageId} not found.` });
    }

    res.json({ message: "Message deleted successfully.", deletedMessage });
  });

  // Error Handling Middleware
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: "An unexpected error occurred." });
  });

  // Start the server
  const port = process.env.PORT || 3000;
  return app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
});
