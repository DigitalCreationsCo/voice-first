"use client";
import { useChat, useCompletion } from '@ai-sdk/react'

import { Message as PreviewMessage } from "@/components/chat/message";
import { useScrollToBottom } from "@/hooks/use-scroll-to-bottom";

import { MultimodalInput } from "./multimodal-input";
import { Overview } from "../custom/overview";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Send, Trash2, Download, Settings, MessageSquare, Headphones } from 'lucide-react';

export function Chat() {
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [apiKey, setApiKey] = useState('AIzaSyDwPluan48-7Hrm5xqfMAW5Zets4kezEYE');
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [textInput, setTextInput] = useState('');

  // Audio state
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioQueue, setAudioQueue] = useState([]);

  // Refs for audio handling
  const sessionRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const transcriptRef = useRef(null);
  const responseQueueRef = useRef([]);
  const audioPlaybackRef = useRef(null);

  // Configuration following Gemini Live API patterns
  const LIVE_MODEL = "gemini-2.5-flash-preview-native-audio-dialog";
  const SESSION_CONFIG = {
    responseModalities: ["AUDIO", "TEXT"],
    systemInstruction: "You are a helpful AI assistant. Respond naturally and conversationally. Keep responses concise but engaging.",
    generationConfig: {
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Aoede" }
        }
      }
    }
  };

  // Initialize audio context for recording
  const initializeAudioContext = useCallback(async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000
        });
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      mediaStreamRef.current = stream;
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      processor.onaudioprocess = (event) => {
        if (!isRecording || !sessionRef.current) return;

        const inputBuffer = event.inputBuffer.getChannelData(0);
        
        // Calculate audio level for visualization
        const sum = inputBuffer.reduce((acc, val) => acc + Math.abs(val), 0);
        setAudioLevel(sum / inputBuffer.length);

        // Convert to 16-bit PCM
        const pcmData = new Int16Array(inputBuffer.length);
        for (let i = 0; i < inputBuffer.length; i++) {
          pcmData[i] = Math.max(-32768, Math.min(32767, inputBuffer[i] * 32768));
        }

        // Send audio to Gemini Live API
        const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        
        sessionRef.current?.sendRealtimeInput({
          audio: {
            data: audioBase64,
            mimeType: "audio/pcm;rate=16000"
          }
        });
      };

      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      processorRef.current = processor;

    } catch (err) {
      setError(`Microphone access failed: ${err.message}`);
    }
  }, [isRecording]);

  // Connect to Gemini Live API
  const connectToGeminiLive = useCallback(async () => {
    if (!apiKey) {
      setError('Please enter your Google AI API key');
      return;
    }

    try {
      setConnectionStatus('connecting');
      setError('');

      // Import Gemini SDK dynamically (simulated - in real app you'd import properly)
      // const { GoogleGenAI } = await import('@google/genai');
      // const ai = new GoogleGenAI({ apiKey });
      
      // For this demo, we'll simulate the connection
      const simulateConnection = () => {
        return {
          sendRealtimeInput: (input) => {
            console.log('Sending input:', input);
            // Simulate processing and response
            setTimeout(() => {
              if (input.audio) {
                handleSimulatedResponse('I heard your audio input. How can I help you?');
              } else if (input.text) {
                handleSimulatedResponse(`You said: "${input.text}". That's interesting!`);
              }
            }, 1000);
          },
          close: () => {
            setIsConnected(false);
            setConnectionStatus('disconnected');
          }
        };
      };

      sessionRef.current = simulateConnection();
      setIsConnected(true);
      setConnectionStatus('connected');

    } catch (err) {
      setError(`Connection failed: ${err.message}`);
      setConnectionStatus('error');
    }
  }, [apiKey]);

  // Handle simulated responses (replace with real Live API handling)
  const handleSimulatedResponse = useCallback((textResponse) => {
    const message = {
      id: Date.now() + Math.random(),
      type: 'ai',
      content: textResponse,
      timestamp: new Date().toISOString(),
      hasAudio: true
    };

    setConversation(prev => [...prev, message]);

    // Simulate audio playback
    if (!isMuted) {
      setIsPlaying(true);
      setTimeout(() => setIsPlaying(false), 2000);
    }
  }, [isMuted]);

  // Send text input
  const sendTextInput = useCallback((text) => {
    if (!isConnected || !sessionRef.current || !text.trim()) return;

    // Add user message to conversation
    const userMessage = {
      id: Date.now() + Math.random(),
      type: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      inputType: 'text'
    };

    setConversation(prev => [...prev, userMessage]);

    // Send to Gemini Live API
    sessionRef.current.sendRealtimeInput({
      text: text
    });

    setTextInput('');
  }, [isConnected]);

  // Toggle recording
  const toggleRecording = useCallback(async () => {
    if (!isConnected) {
      setError('Please connect first');
      return;
    }

    if (!isRecording) {
      await initializeAudioContext();
      setIsRecording(true);
      setCurrentTranscript('🎤 Recording...');
      
      // Add recording indicator to conversation
      const recordingMessage = {
        id: 'recording-' + Date.now(),
        type: 'user',
        content: '🎤 Recording audio...',
        timestamp: new Date().toISOString(),
        inputType: 'audio',
        isRecording: true
      };
      setConversation(prev => [...prev, recordingMessage]);

    } else {
      setIsRecording(false);
      setCurrentTranscript('');
      setAudioLevel(0);
      
      // Remove recording indicator and add actual transcription
      setConversation(prev => 
        prev.filter(msg => msg.id !== 'recording-' + Date.now()).concat({
          id: Date.now() + Math.random(),
          type: 'user',
          content: 'Audio input sent',
          timestamp: new Date().toISOString(),
          inputType: 'audio'
        })
      );

      // Stop media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  }, [isConnected, isRecording, initializeAudioContext]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.close();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Auto-scroll conversation
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [conversation]);

  const clearConversation = () => setConversation([]);

  const exportTranscript = () => {
    const transcript = conversation.map(msg => 
      `[${new Date(msg.timestamp).toLocaleTimeString()}] ${
        msg.type === 'user' ? 'User' : 'AI'
      } (${msg.inputType || 'text'}): ${msg.content}`
    ).join('\n\n');
    
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini-live-conversation-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-blue-950 via-indigo-900 to-purple-950">
      {/* Header */}
      <header className="flex items-center justify-between p-4 bg-black/30 backdrop-blur-lg border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
            <Headphones className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Gemini Live</h1>
            <p className="text-xs text-white/60">Voice & Text Conversation</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${
            connectionStatus === 'connected' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
            connectionStatus === 'connecting' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
            'bg-red-500/20 text-red-400 border border-red-500/30'
          }`}>
            {connectionStatus.toUpperCase()}
          </div>
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div className="p-4 bg-black/40 backdrop-blur-lg border-b border-white/10">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-white mb-2">
                Google AI API Key
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key from AI Studio"
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={connectToGeminiLive}
              disabled={connectionStatus === 'connecting'}
              className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-500 text-white rounded-lg transition-colors font-medium"
            >
              {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
            </button>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-500/20 border-b border-red-500/30 text-red-200 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Voice Control Panel */}
        <div className="w-80 p-6 bg-black/20 backdrop-blur-lg border-r border-white/10 flex flex-col">
          {/* Audio Visualization */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="relative w-32 h-32 mb-8">
              {/* Pulsing circle for audio level */}
              <div 
                className={`absolute inset-0 rounded-full transition-all duration-300 ${
                  isRecording 
                    ? 'bg-red-500/20 border-2 border-red-500/50' 
                    : isPlaying 
                    ? 'bg-blue-500/20 border-2 border-blue-500/50'
                    : 'bg-gray-500/20 border-2 border-gray-500/50'
                }`}
                style={{
                  transform: `scale(${1 + (isRecording ? audioLevel * 0.5 : isPlaying ? 0.1 : 0)})`
                }}
              />
              <div className="absolute inset-4 rounded-full bg-white/5 flex items-center justify-center">
                {isRecording ? (
                  <MicOff className="w-8 h-8 text-red-400" />
                ) : isPlaying ? (
                  <Volume2 className="w-8 h-8 text-blue-400" />
                ) : (
                  <Mic className="w-8 h-8 text-gray-400" />
                )}
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex gap-3 mb-6">
              <button
                onClick={toggleRecording}
                disabled={!isConnected}
                className={`p-4 rounded-full transition-all transform ${
                  isRecording 
                    ? 'bg-red-500 hover:bg-red-600 text-white scale-110' 
                    : 'bg-blue-500 hover:bg-blue-600 disabled:bg-gray-500 text-white hover:scale-105'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isRecording ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
              
              <button
                onClick={() => setIsMuted(!isMuted)}
                className={`p-4 rounded-full transition-all ${
                  isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-600 hover:bg-gray-700'
                } text-white`}
              >
                {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
              </button>
            </div>
            
            {/* Status Text */}
            <div className="text-center text-white/70">
              <p className="text-sm mb-1">
                {!isConnected ? 'Connect to start' :
                 isRecording ? '🔴 Recording...' : 
                 isPlaying ? '🔊 Playing response' :
                 '👆 Tap to record'}
              </p>
              {currentTranscript && (
                <p className="text-xs text-blue-400 mt-2">{currentTranscript}</p>
              )}
            </div>
          </div>

          {/* Model Info */}
          <div className="mt-6 p-3 bg-white/5 rounded-lg border border-white/10">
            <p className="text-xs text-white/60 mb-1">Model</p>
            <p className="text-sm text-white font-medium">Gemini 2.5 Flash</p>
            <p className="text-xs text-white/60">Native Audio Dialog</p>
          </div>
        </div>

        {/* Conversation Area */}
        <div className="flex-1 flex flex-col">
          {/* Conversation Header */}
          <div className="p-4 bg-black/20 backdrop-blur-lg border-b border-white/10 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Conversation Transcript
            </h2>
            <div className="flex gap-2">
              <button
                onClick={exportTranscript}
                disabled={conversation.length === 0}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white transition-colors"
                title="Export transcript"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={clearConversation}
                disabled={conversation.length === 0}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white transition-colors"
                title="Clear conversation"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={transcriptRef}
            className="flex-1 overflow-y-auto p-4 space-y-4"
          >
            {conversation.length === 0 ? (
              <div className="text-center text-white/50 mt-12">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/10 flex items-center justify-center">
                  <Headphones className="w-8 h-8" />
                </div>
                <p className="text-lg mb-2">Start a conversation</p>
                <p className="text-sm">Connect to Gemini Live and speak or type your message</p>
              </div>
            ) : (
              conversation.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl ${
                      message.type === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-white/10 backdrop-blur-lg text-white border border-white/20'
                    }`}
                  >
                    <div className="flex items-start gap-2 mb-1">
                      <p className="text-sm flex-1">{message.content}</p>
                      {message.inputType === 'audio' && (
                        <div className="w-4 h-4 rounded-full bg-current opacity-30 flex-shrink-0 mt-0.5" />
                      )}
                      {message.hasAudio && message.type === 'ai' && (
                        <Volume2 className="w-4 h-4 opacity-50 flex-shrink-0 mt-0.5" />
                      )}
                    </div>
                    <p className={`text-xs opacity-60 ${
                      message.type === 'user' ? 'text-blue-100' : 'text-white/50'
                    }`}>
                      {new Date(message.timestamp).toLocaleTimeString()}
                      {message.inputType && ` • ${message.inputType}`}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Text Input */}
          <div className="p-4 bg-black/20 backdrop-blur-lg border-t border-white/10">
            <div className="flex gap-3">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={isConnected ? "Type a message..." : "Connect first to chat"}
                disabled={!isConnected}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendTextInput(textInput);
                  }
                }}
                className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={() => sendTextInput(textInput)}
                disabled={!isConnected || !textInput.trim()}
                className="p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-500 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
