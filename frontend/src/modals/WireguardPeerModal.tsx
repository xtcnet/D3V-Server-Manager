import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { Alert } from "react-bootstrap";
import Modal from "react-bootstrap/Modal";
import { Button } from "src/components";
import { useSetWireguardPeer } from "src/hooks";
import { T } from "src/locale";
import { validateNumber, validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showWireguardPeerModal = (serverId: number, peerId?: number, peerData?: any) => {
	EasyModal.show(WireguardPeerModal, { serverId, peerId, peerData });
};

interface Props extends InnerModalProps {
	serverId: number;
	peerId?: number;
	peerData?: any;
}

const WireguardPeerModal = EasyModal.create(({ serverId, peerId, peerData, visible, remove }: Props) => {
	const { mutate: setPeer } = useSetWireguardPeer();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const payload = {
			id: peerId || undefined,
			serverId,
			...values,
		};

		setPeer(payload, {
			onError: (err: any) => setErrorMsg(err.message),
			onSuccess: () => {
				showObjectSuccess("wireguard-peer", "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	return (
		<Modal show={visible} onHide={remove}>
			<Formik
				initialValues={{
					name: peerData?.name || "",
					allowedIps: peerData?.allowedIps || "0.0.0.0/0, ::/0",
					persistentKeepalive: peerData?.persistentKeepalive ?? 25,
				}}
				onSubmit={onSubmit}
			>
				{() => (
					<Form>
						<Modal.Header closeButton>
							<Modal.Title>
								<T id={peerId ? "object.edit" : "object.add"} tData={{ object: "wireguard-peer" }} />
							</Modal.Title>
						</Modal.Header>
						<Modal.Body>
							<Alert variant="danger" show={!!errorMsg} onClose={() => setErrorMsg(null)} dismissible>
								{errorMsg}
							</Alert>

							<Field name="name" validate={validateString(1, 255)}>
								{({ field, form }: any) => (
									<div className="mb-3">
										<label className="form-label" htmlFor="peer-name">
											<T id="column.name" />
										</label>
										<input id="peer-name" type="text" className={`form-control ${form.errors.name && form.touched.name ? "is-invalid" : ""}`} placeholder="e.g. Phone, Laptop" required {...field} />
										{form.errors.name && form.touched.name && <div className="invalid-feedback">{form.errors.name}</div>}
									</div>
								)}
							</Field>

							<Field name="allowedIps" validate={validateString(1, 255)}>
								{({ field }: any) => (
									<div className="mb-3">
										<label className="form-label" htmlFor="peer-allowed-ips">
											<T id="wireguard.allowed-ips" />
										</label>
										<input id="peer-allowed-ips" type="text" className="form-control" placeholder="0.0.0.0/0, ::/0" {...field} />
										<small className="form-hint"><T id="wireguard.allowed-ips.hint" /></small>
									</div>
								)}
							</Field>

							<Field name="persistentKeepalive" validate={validateNumber(0, 65535)}>
								{({ field }: any) => (
									<div className="mb-3">
										<label className="form-label" htmlFor="peer-keepalive">
											<T id="wireguard.persistent-keepalive" />
										</label>
										<input id="peer-keepalive" type="number" min={0} max={65535} className="form-control" {...field} />
									</div>
								)}
							</Field>
						</Modal.Body>
						<Modal.Footer>
							<Button onClick={remove} disabled={isSubmitting}><T id="cancel" /></Button>
							<Button type="submit" actionType="primary" className="ms-auto" isLoading={isSubmitting} disabled={isSubmitting}>
								<T id="save" />
							</Button>
						</Modal.Footer>
					</Form>
				)}
			</Formik>
		</Modal>
	);
});

export { showWireguardPeerModal };
