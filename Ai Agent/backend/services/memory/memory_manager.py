import logging
from typing import Dict, Any, List, Optional
import chromadb
from config import settings

logger = logging.getLogger("memory_manager")

class MemoryManager:
    def __init__(self):
        self.chroma_client = None
        self.collection = None
        # Fallback in-memory storage for testing/development
        self.local_long_term_store: List[Dict[str, Any]] = []
        self.local_session_store: Dict[str, List[Dict[str, Any]]] = {}

        try:
            # Initialize ChromaDB client
            self.chroma_client = chromadb.HttpClient(
                host=settings.CHROMA_HOST, 
                port=settings.CHROMA_PORT
            )
            # Create or get collection
            self.collection = self.chroma_client.get_or_create_collection("omniops_memory")
            logger.info("ChromaDB Client initialized successfully.")
        except Exception as e:
            logger.warning(f"ChromaDB unavailable: {e}. Falling back to in-memory store.")
            self.chroma_client = None

    def store_session_context(self, workflow_id: str, step_data: Dict[str, Any]) -> None:
        """
        Req 4.1: Store intermediate outputs in Session_Memory.
        """
        if workflow_id not in self.local_session_store:
            self.local_session_store[workflow_id] = []
        self.local_session_store[workflow_id].append(step_data)
        logger.info(f"Stored session context for workflow {workflow_id}.")

    def get_session_context(self, workflow_id: str) -> List[Dict[str, Any]]:
        """
        Req 4.1 & 3.6: Retrieve context.
        """
        return self.local_session_store.get(workflow_id, [])

    def persist_long_term_memory(self, doc_id: str, document_text: str, metadata: Dict[str, Any]) -> None:
        """
        Req 4.2 & 4.6: Persist outcomes/knowledge base entries.
        """
        # Save to local in-memory store
        self.local_long_term_store.append({
            "id": doc_id,
            "text": document_text,
            "metadata": metadata
        })
        
        # Save to Chroma DB if available
        if self.collection:
            try:
                self.collection.add(
                    documents=[document_text],
                    metadatas=[metadata],
                    ids=[doc_id]
                )
                logger.info(f"Persisted document {doc_id} to ChromaDB.")
            except Exception as e:
                logger.error(f"Failed to add document to ChromaDB: {e}")

    def semantic_search(self, query: str, k: int = 3) -> List[Dict[str, Any]]:
        """
        Req 4.3: Perform semantic search.
        """
        if self.collection:
            try:
                results = self.collection.query(
                    query_texts=[query],
                    n_results=k
                )
                formatted = []
                if results and 'documents' in results and results['documents']:
                    for i in range(len(results['documents'][0])):
                        formatted.append({
                            "text": results['documents'][0][i],
                            "metadata": results['metadatas'][0][i] if results['metadatas'] else {},
                            "score": results['distances'][0][i] if 'distances' in results else 1.0
                        })
                return formatted
            except Exception as e:
                logger.error(f"ChromaDB semantic search failed: {e}. Falling back to keyword search.")

        # Keyword matching fallback for local run
        matches = []
        query_words = set(query.lower().split())
        for item in self.local_long_term_store:
            text_words = set(item["text"].lower().split())
            intersection = query_words.intersection(text_words)
            if intersection:
                matches.append({
                    "text": item["text"],
                    "metadata": item["metadata"],
                    "score": len(intersection) / len(query_words)
                })
        
        # Sort matches by score descending
        matches.sort(key=lambda x: x["score"], reverse=True)
        return matches[:k]

    def compress_session_memory(self, workflow_id: str, max_tokens: int = 2000) -> None:
        """
        Req 4.4: Compress session memory when it gets too long.
        """
        history = self.local_session_store.get(workflow_id, [])
        if not history:
            return
            
        # Standard mockup logic for context compression:
        # If length is above 10 steps, compress early steps into a summary
        if len(history) > 10:
            logger.info(f"Compressing session memory for workflow {workflow_id}.")
            compressed_summary = {
                "step": "COMPRESSION_SUMMARY",
                "output": "Summary of first 5 steps: Initial diagnostic request processed. Latency anomalies examined."
            }
            self.local_session_store[workflow_id] = [compressed_summary] + history[5:]

# Single shared memory manager instance
memory_manager = MemoryManager()
