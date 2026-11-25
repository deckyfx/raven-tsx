/**
 * The services of the device, from TSX: the Device tab of Raven's mobile showcase
 * (`examples/mobile/shared/showcase.c`), as an application of its own.
 *
 * Each service is a promise of the core: `requestPermission`, `takePhoto`, `pickPhotos`,
 * `openFiles`, `saveFile`, `share`. Its answer comes at a later frame, and what awaits it sets the
 * state as a timer would. The status of the permissions is state too (`usePermission`), which
 * follows what the user changes in the Settings of the system while the application is away.
 *
 * On a desktop the pickers are file dialogs, and the camera, the share sheet and the haptics say
 * they are not there: the line at the bottom tells each answer, as it comes.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
	Border, Button, clipboardHasText, haptic, HBox, Image, isCameraAvailable, isHapticSupported, Label, openFiles, openSettings, openUrl, pickPhotos, raven, runApp,
	saveFile, ScrollBox, share, takePhoto, usePermission, VBox, type DeviceAnswer, type DeviceResult, type Haptic, type Permission, type PickedFile,
} from "@decky.fx/raven-tsx/react";

const PAGE_URL = "https://github.com/oscar-soirey/Raven";

/** What an answer means, said to the user. */
const SAID: Readonly<Record<DeviceResult, string>> = {
	done: "done",
	cancelled: "cancelled",
	denied: "refused (permission)",
	unsupported: "not there on this device",
	busy: "busy: another screen of the system is open",
	failed: "failed (see the log)",
};

const HAPTICS: readonly Haptic[] = ["light", "medium", "heavy", "selection", "success", "warning", "error"];

const IMAGE = /\.(png|jpe?g|gif|bmp|tga|svg|webp)$/i;

/** Whether Raven can show a file as a picture. */
const isImage = (file: PickedFile): boolean => (file.mimeType?.startsWith("image/") === true && file.mimeType !== "image/heic") || IMAGE.test(file.name || (file.path ?? ""));

/**
 * A texture made from a file on a worker thread, destroyed when the next one comes or the component goes.
 * `selection` is what the user picked: picking the same path again makes the texture again, as the file may
 * have changed (the showcase makes one at each pick).
 */
function useTexture(path: string | null, selection: object | null): raven.Rid {
	const [texture, setTexture] = useState<raven.Rid>(raven.R_INVALID_ID);
	useEffect(() => {
		if (!path) {
			setTexture(raven.R_INVALID_ID);
			return;
		}
		const made = raven.Rtexture_create_from_file_async(path);
		setTexture(made);
		return () => raven.Rtexture_destroy(made);
	}, [path, selection]);
	return texture;
}

/** A group of the page, with its title. */
function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
	return (
		<Border Class="card" Slot={{ Padding: [0, 0, 0, 12] }}>
			<VBox Spacing={8} Slot={{ Padding: 14 }}>
				<Label FontStyle="Bold">{title}</Label>
				{children}
			</VBox>
		</Border>
	);
}

/** A permission: its status, which follows the system, and the button that asks. */
function PermissionRow({ name, note, onAnswer }: { name: Permission; note?: string; onAnswer: (text: string) => void }): ReactNode {
	const [status, ask] = usePermission(name);
	return (
		<HBox Spacing={8}>
			<Label Width={280} Slot={{ VAlign: "Center" }}>{`${name}: ${status}${note ?? ""}`}</Label>
			<Button OnClicked={() => void ask().then((answer) => onAnswer(`${name}: ${answer}`))}>Ask</Button>
		</HBox>
	);
}

function App(): ReactNode {
	const [status, setStatus] = useState("Each answer comes here, once the system gave it.");
	const [photo, setPhoto] = useState<PickedFile | null>(null);
	const [file, setFile] = useState<{ readonly picked: PickedFile; readonly firstLine: string } | null>(null);
	const [clipboard, setClipboard] = useState("Clipboard: copy something, then paste it.");
	const photoTexture = useTexture(photo?.path ?? null, photo);
	const fileTexture = useTexture(file && isImage(file.picked) ? file.picked.path : null, file);

	/** Says what a request answered, and gives its files when it is done. */
	const told = (what: string, answer: DeviceAnswer): readonly PickedFile[] => {
		setStatus(`${what}: ${SAID[answer.result]}`);
		return answer.result === "done" ? answer.files : [];
	};

	const showPhoto = (what: string) => (answer: DeviceAnswer): void => {
		const [first] = told(what, answer);
		if (first?.path) {
			setPhoto(first);
		}
	};

	// (each pick counts: a slow read of an earlier one must not show it over a later one)
	const picks = useRef(0);
	const pickFile = async (): Promise<void> => {
		const pick = ++picks.current;
		setStatus("file picker...");
		const [first] = told("pick a file", await openFiles());
		if (!first) {
			return;
		}
		// (a small text: its first line; a file that cannot be read is still the one picked)
		let firstLine = "";
		if (first.path && !isImage(first) && first.size > 0 && first.size < 65536) {
			try {
				firstLine = (await Bun.file(first.path).text()).split(/\r?\n/, 1)[0]?.slice(0, 60) ?? "";
			} catch {
				firstLine = "";
			}
		}
		if (pick === picks.current) {
			setFile({ picked: first, firstLine });
		}
	};

	const save = async (): Promise<void> => {
		setStatus("save...");
		const text = `Saved by the device example of raven-tsx, ${raven.Rget_time().toFixed(0)} seconds after it started.\n`;
		const [saved] = told("save", await saveFile(text, { fileName: "raven-device.txt", filters: [{ name: "Text", patterns: "*.txt" }], defaultExtension: "txt" }));
		if (saved) {
			setStatus(`saved as ${saved.name}${saved.path ? ` in ${saved.path}` : ""}`);
		}
	};

	const shareIt = async (): Promise<void> => {
		setStatus("share...");
		// (the last photo too, when there is one)
		told("share", await share({ text: `Raven, a GUI library in C: ${PAGE_URL}`, title: "Share from Raven", ...(photo?.path ? { path: photo.path } : {}) }));
	};

	const paste = (): void => {
		// (the moment to read the clipboard: the user asked for it)
		setClipboard(clipboardHasText() ? `Clipboard: "${(raven.Rclipboard_get_text() ?? "").slice(0, 120)}"` : "Clipboard: no text in it.");
	};

	return (
		<VBox Slot={{ Fill: 1 }}>
			<ScrollBox Slot={{ Fill: 1 }}>
				<VBox Spacing={0} Slot={{ Padding: 16 }}>
					<Section title="Permissions">
						<PermissionRow name="camera" note={isCameraAvailable() ? "" : " (no camera here)"} onAnswer={setStatus} />
						<PermissionRow name="notifications" onAnswer={setStatus} />
						<PermissionRow name="location" onAnswer={setStatus} />
						<PermissionRow name="photos" onAnswer={setStatus} />
						<Button OnClicked={() => void (openSettings() || setStatus("Settings: no page of the application to open here"))}>Open the Settings of the app</Button>
					</Section>
					<Section title="Camera and photos">
						<HBox Spacing={8}>
							<Button OnClicked={() => void takePhoto().then(showPhoto("camera"))}>Take a photo</Button>
							<Button OnClicked={() => void pickPhotos(1).then(showPhoto("photo"))}>Pick a photo</Button>
						</HBox>
						{photo && <Label Wrap>{`${photo.name}, ${(photo.size / 1024).toFixed(1)} KB${photo.width > 0 ? `, ${photo.width} x ${photo.height}` : ""}`}</Label>}
						{photoTexture !== raven.R_INVALID_ID && <Image Texture={photoTexture} Height={180} Stretch="Fit" />}
					</Section>
					<Section title="Files">
						<HBox Spacing={8}>
							<Button OnClicked={() => void pickFile()}>Pick a file</Button>
							<Button OnClicked={() => void save()}>Save a file</Button>
						</HBox>
						{file && <Label Wrap>{`${file.picked.name}: ${file.picked.size} bytes${file.picked.mimeType ? `, ${file.picked.mimeType}` : ""}${file.firstLine ? `\nFirst line: ${file.firstLine}` : ""}`}</Label>}
						{fileTexture !== raven.R_INVALID_ID && <Image Texture={fileTexture} Height={140} Stretch="Fit" />}
					</Section>
					<Section title={`Haptics${isHapticSupported() ? "" : " (none on this device)"}`}>
						<HBox Spacing={6}>
							{HAPTICS.map((kind) => (
								<Button key={kind} OnClicked={() => setStatus(haptic(kind) ? `haptic: ${kind}` : "haptic: none on this device")}>{kind}</Button>
							))}
						</HBox>
					</Section>
					<Section title="Links, sharing, the clipboard">
						<HBox Spacing={8}>
							<Button OnClicked={() => setStatus(openUrl(PAGE_URL) ? `opening ${PAGE_URL}` : `could not open ${PAGE_URL}`)}>Open Raven's page</Button>
							<Button OnClicked={() => void shareIt()}>Share</Button>
							<Button OnClicked={() => { raven.Rclipboard_set_text(`Copied from the device example at ${raven.Rget_time().toFixed(1)} s`); setClipboard("Clipboard: copied. Paste it here, or elsewhere."); }}>Copy</Button>
							<Button OnClicked={paste}>Paste</Button>
						</HBox>
						<Label Name="clipboard" Wrap>{clipboard}</Label>
					</Section>
				</VBox>
			</ScrollBox>
			<Label Name="status" Slot={{ Padding: [16, 8, 16, 12] }}>{status}</Label>
		</VBox>
	);
}

await runApp(<App />, { Title: "Raven - device", Width: 640, Height: 760 });
